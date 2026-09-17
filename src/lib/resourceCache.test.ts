import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import bigInt from 'big-integer';

import { activateAccount, getAccountGeneration, invalidateAccount, type AccountScope } from './accountScope';
import { resourceDB, writeResource, readCacheEpoch, purgeResources, DISK_MAX_BYTES, DISK_MAX_COUNT, DISK_MAX_AGE, discardLegacyDatabase, type ResourceRow } from './db';

const rpc = vi.hoisted(() => ({ invoke: vi.fn(), downloadMedia: vi.fn(), getEntity: vi.fn(), downloadProfilePhoto: vi.fn() }));
vi.mock('./telegram/client', () => ({ getClient: async () => rpc }));
vi.mock('./telegram/peers', () => ({ getInputPeerForForumId: (id: number) => new Api.InputPeerChannel({ channelId: bigInt(id), accessHash: bigInt(1) }) }));
vi.mock('./telegram/requests', () => ({ runRead: async (_scope: AccountScope, task: () => Promise<unknown>) => task() }));
import { clearResourceCache, getMediaBlob, getForumAvatar, resourceIdentity } from './resourceCache';

let scope: AccountScope;
let nextAccount = 0;
function mediaMessage(forumId: number, id = 42, photoId = forumId): Api.Message {
	return new Api.Message({ id, peerId: new Api.PeerChannel({ channelId: bigInt(forumId) }), date: 1, message: '', media: new Api.MessageMediaPhoto({ photo: new Api.Photo({ id: bigInt(photoId), accessHash: bigInt(1), fileReference: new Uint8Array([]), date: 1, sizes: [], dcId: 1 }) }) });
}
function row(reference: string, bytes = 4, accessedAt = Date.now()): ResourceRow {
	return { key: resourceIdentity(scope.accountId, reference, 'v1'), accountId: scope.accountId, reference, revision: 'v1', blob: new Blob(['data']), bytes, validatedAt: Date.now(), accessedAt };
}
beforeEach(async () => {
	scope = await activateAccount(`cache-test-${++nextAccount}`, getAccountGeneration());
	vi.clearAllMocks();
	rpc.invoke.mockImplementation(async (request: Api.channels.GetMessages) => ({ messages: [mediaMessage(Number((request.channel as Api.InputChannel).channelId))] }));
	rpc.downloadMedia.mockImplementation(async (media: Api.MessageMediaPhoto) => new TextEncoder().encode(String((media.photo as Api.Photo).id)));
});
afterEach(async () => { vi.restoreAllMocks(); await invalidateAccount(); });

describe('scoped media cache behavior', () => {
	it('separates equal message IDs in different channels and coalesces duplicate reads', async () => {
		const [first, duplicate, other] = await Promise.all([getMediaBlob(11, 42, scope), getMediaBlob(11, 42, scope), getMediaBlob(22, 42, scope)]);
		expect(await first?.text()).toBe('11');
		expect(await duplicate?.text()).toBe('11');
		expect(await other?.text()).toBe('22');
		expect(rpc.downloadMedia).toHaveBeenCalledTimes(2);
	});
	it('uses owned warm disk before RPC or byte download', async () => {
		const reference = JSON.stringify(['media', 'channel', 11, 42]);
		await writeResource(row(reference), await readCacheEpoch(scope.accountId));
		expect(await (await getMediaBlob(11, 42, scope))?.text()).toBe('data');
		expect(rpc.invoke).not.toHaveBeenCalled();
		expect(rpc.downloadMedia).not.toHaveBeenCalled();
	});
	it('revalidates stale metadata and never returns deleted or denied content', async () => {
		const reference = JSON.stringify(['media', 'channel', 11, 42]);
		await writeResource({ ...row(reference), validatedAt: 1 }, await readCacheEpoch(scope.accountId));
		rpc.invoke.mockResolvedValueOnce({ messages: [] });
		expect(await getMediaBlob(11, 42, scope)).toBeNull();
		await clearResourceCache(scope);
		await writeResource({ ...row(reference), validatedAt: 1 }, await readCacheEpoch(scope.accountId));
		rpc.invoke.mockRejectedValueOnce(new Error('CHANNEL_PRIVATE'));
		await expect(getMediaBlob(11, 42, scope)).rejects.toThrow('CHANNEL_PRIVATE');
		expect(rpc.downloadMedia).not.toHaveBeenCalled();
	});
	it('keeps downloaded content when optional disk writes hit quota', async () => {
		vi.spyOn(resourceDB.resources, 'put').mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'));
		expect(await (await getMediaBlob(11, 42, scope))?.text()).toBe('11');
	});
	it('rejects a download released after clear and allows a fresh read', async () => {
		let release!: (data: Uint8Array) => void;
		const download = new Promise<Uint8Array>(resolve => { release = resolve; });
		rpc.downloadMedia.mockReturnValueOnce(download);
		const pending = getMediaBlob(11, 42, scope);
		const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		await vi.waitFor(() => expect(rpc.downloadMedia).toHaveBeenCalledTimes(1));
		await clearResourceCache(scope);
		release(new TextEncoder().encode('old'));
		await rejected;
		expect(await resourceDB.resources.where('accountId').equals(scope.accountId).count()).toBe(0);
		expect(await (await getMediaBlob(11, 42, scope))?.text()).toBe('11');
	});
	it('does not cache a missing avatar forever', async () => {
		const reference = JSON.stringify(['avatar', 'forum', 11]);
		await writeResource({ ...row(reference), blob: null, bytes: 0, validatedAt: Date.now() - 61_000 }, await readCacheEpoch(scope.accountId));
		rpc.getEntity.mockResolvedValueOnce(new Api.Channel({ id: bigInt(11), title: 'test', photo: new Api.ChatPhoto({ photoId: bigInt(7), dcId: 1 }), date: 1 }));
		rpc.downloadProfilePhoto.mockResolvedValueOnce(new TextEncoder().encode('new-avatar'));
		expect(await (await getForumAvatar(11, scope))?.text()).toBe('new-avatar');
	});
});

describe('transactional cache persistence', () => {
	it('serializes purge with concurrent writes and rejects stale epoch writes', async () => {
		const epoch = await readCacheEpoch(scope.accountId);
		const old = row('old');
		await Promise.all([writeResource(old, epoch), purgeResources(scope.accountId), writeResource(row('queued'), epoch)]);
		expect(await writeResource(old, epoch)).toBe(false);
		expect(await resourceDB.resources.where('accountId').equals(scope.accountId).count()).toBe(0);
		await writeResource(row('fresh'), await readCacheEpoch(scope.accountId));
		expect((await resourceDB.resources.where('accountId').equals(scope.accountId).toArray()).map(item => item.reference)).toEqual(['fresh']);
	});
	it('enforces disk byte, count and age budgets without deleting another database', async () => {
		const epoch = await readCacheEpoch(scope.accountId);
		await resourceDB.resources.bulkPut(Array.from({ length: DISK_MAX_COUNT }, (_, i) => row(`old-${i}`, 1, Date.now() - DISK_MAX_AGE - 1)));
		await writeResource(row('large', DISK_MAX_BYTES - 1), epoch);
		await writeResource(row('new', 4), epoch);
		expect((await resourceDB.resources.toArray()).map(item => item.reference)).toEqual(['new']);
		await resourceDB.resources.bulkPut(Array.from({ length: DISK_MAX_COUNT }, (_, i) => row(`small-${i}`, 1, Date.now() - 10)));
		await writeResource(row('latest', 1), epoch);
		expect(await resourceDB.resources.count()).toBe(DISK_MAX_COUNT);
		expect(await resourceDB.resources.get(row('latest').key)).toBeDefined();
	});
	it('discards legacy v1 schema without attempting the failing primary-key upgrade', async () => {
		const request = indexedDB.open('forumgram', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('messages', { keyPath: ['topicId', 'id'] });
		await new Promise<void>((resolve, reject) => { request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
		await discardLegacyDatabase();
		await writeResource(row('new-database'), await readCacheEpoch(scope.accountId));
		expect(await resourceDB.resources.get(row('new-database').key)).toBeDefined();
	});
});
