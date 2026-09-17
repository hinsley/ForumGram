import { useEffect, useState } from 'react';
import { Api } from 'telegram';
import { captureAccountScope, assertAccountScope, onAccountDispose, type AccountScope } from './accountScope';
import { getClient } from './telegram/client';
import { getInputPeerForForumId } from './telegram/peers';
import { runRead } from './telegram/requests';
import { discardLegacyDatabase, readCacheEpoch, readResource, writeResource, purgeResources, resourceUsage, type ResourceRow } from './db';
import { discardLegacyMedia } from './opfs';

const MEDIA_TTL = 5 * 60_000;
const AVATAR_TTL = 15 * 60_000;
const NEGATIVE_TTL = 60_000;
export const MEMORY_MAX_BYTES = 32 * 1024 * 1024;
export const MEMORY_MAX_COUNT = 128;
const memory = new Map<string, ResourceRow>();
let memoryBytes = 0;
const pending = new Map<string, Promise<Blob | null>>();
const generations = new Map<string, number>();
const knownEpochs = new Map<string, number>();
const blocked = new Set<string>();
const purges = new Map<string, Promise<void>>();
const blobOwners = new WeakMap<Blob, { accountId: string; generation: number }>();
const urlInvalidators = new Set<(accountId: string) => void>();
const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('forumgram-resource-cache-v1') : null;

function invalidateLocal(accountId: string): void {
	knownEpochs.delete(accountId);
	generations.set(accountId, (generations.get(accountId) ?? 0) + 1);
	for (const [key, row] of memory) {
		if (row.accountId === accountId) { memoryBytes -= row.bytes; memory.delete(key); }
	}
	for (const invalidate of urlInvalidators) invalidate(accountId);
}
if (channel) channel.onmessage = ({ data }) => {
	if (data?.type === 'purge' && typeof data.accountId === 'string') invalidateLocal(data.accountId);
};
let legacyCleanup: Promise<void> | undefined;
function discardLegacy(): Promise<void> {
	return legacyCleanup ??= Promise.all([
		discardLegacyDatabase(), discardLegacyMedia(),
		typeof caches === 'undefined' ? Promise.resolve() : caches.delete('images').then(() => undefined),
	]).then(() => undefined).catch(error => { legacyCleanup = undefined; throw error; });
}
// Opportunistic legacy cleanup never prevents displaying newly downloaded bytes.
if (typeof window !== 'undefined') void discardLegacy().catch(() => undefined);

export async function clearResourceCache(scope = captureAccountScope()): Promise<void> {
	assertAccountScope(scope);
	await purgeAccount(scope.accountId);
	await discardLegacy();
	assertAccountScope(scope);
}
function purgeAccount(accountId: string): Promise<void> {
	const active = purges.get(accountId);
	if (active) return active;
	blocked.add(accountId);
	invalidateLocal(accountId);
	channel?.postMessage({ type: 'purge', accountId });
	// Only the owned transactional purge gates account disposal. Legacy cleanup
	// is bounded and reported by explicit Clear, not the account-admission barrier.
	const purge = purgeResources(accountId).finally(() => {
		channel?.postMessage({ type: 'purge', accountId });
		blocked.delete(accountId);
		purges.delete(accountId);
	});
	purges.set(accountId, purge);
	return purge;
}
onAccountDispose(scope => purgeAccount(scope.accountId));
export async function getResourceCacheUsage(scope = captureAccountScope()) {
	assertAccountScope(scope);
	const usage = await resourceUsage(scope.accountId);
	assertAccountScope(scope);
	return usage;
}

export function resourceIdentity(accountId: string, reference: string, revision: string): string {
	return JSON.stringify([accountId, reference, revision]);
}
function remember(row: ResourceRow): void {
	const key = resourceIdentity(row.accountId, row.reference, '');
	const old = memory.get(key);
	if (old) { memoryBytes -= old.bytes; memory.delete(key); }
	if (row.bytes > MEMORY_MAX_BYTES) return;
	memory.set(key, row);
	memoryBytes += row.bytes;
	for (const [entryKey, entry] of memory) {
		if (memoryBytes <= MEMORY_MAX_BYTES && memory.size <= MEMORY_MAX_COUNT) break;
		memory.delete(entryKey);
		memoryBytes -= entry.bytes;
	}
}
interface LoadResult { blob: Blob | null; revision: string }
async function getResource(scope: AccountScope, reference: string, ttl: number, load: (previous: ResourceRow | undefined, check: () => void) => Promise<LoadResult>): Promise<Blob | null> {
	assertAccountScope(scope);
	const generation = generations.get(scope.accountId) ?? 0;
	const check = () => {
		assertAccountScope(scope);
		if (blocked.has(scope.accountId) || generation !== (generations.get(scope.accountId) ?? 0)) throw new DOMException('Cache was cleared', 'AbortError');
	};
	check();
	const memoryKey = resourceIdentity(scope.accountId, reference, '');
	const pendingKey = JSON.stringify([scope.accountId, scope.generation, generation, reference]);
	const existing = pending.get(pendingKey);
	if (existing) return existing;
	const task = (async () => {
		let epoch: number | undefined;
		let previous = memory.get(memoryKey);
		try {
			epoch = await readCacheEpoch(scope.accountId);
			const knownEpoch = knownEpochs.get(scope.accountId);
			if (knownEpoch !== undefined && knownEpoch !== epoch) {
				invalidateLocal(scope.accountId);
				throw new DOMException('Cache was cleared in another tab', 'AbortError');
			}
			knownEpochs.set(scope.accountId, epoch);
			previous ??= await readResource(scope.accountId, reference);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') throw error;
			// Persistence is optional; network remains usable.
		}
		check();
		const fresh = previous && Date.now() - previous.validatedAt < (previous.blob ? ttl : NEGATIVE_TTL);
		let result: LoadResult;
		if (fresh && previous) result = { blob: previous.blob, revision: previous.revision };
		else {
			// No stale fallback on metadata errors, deletion, or permission denial.
			try { result = await load(previous, check); }
			catch (error) {
				const stale = memory.get(memoryKey);
				if (stale) { memoryBytes -= stale.bytes; memory.delete(memoryKey); }
				throw error;
			}
		}
		check();
		const row: ResourceRow = { key: resourceIdentity(scope.accountId, reference, result.revision), accountId: scope.accountId, reference, revision: result.revision, blob: result.blob, bytes: result.blob?.size ?? 0, validatedAt: fresh && previous ? previous.validatedAt : Date.now(), accessedAt: Date.now() };
		if (epoch !== undefined) {
			try {
				const written = await writeResource(row, epoch);
				if (!written && await readCacheEpoch(scope.accountId) !== epoch) throw new DOMException('Cache was cleared', 'AbortError');
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') { invalidateLocal(scope.accountId); throw error; }
				// Quota/IDB errors cannot hide successfully downloaded content.
			}
		}
		check();
		remember(row);
		if (result.blob) blobOwners.set(result.blob, { accountId: scope.accountId, generation });
		return result.blob;
	})();
	pending.set(pendingKey, task);
	try { return await task; }
	finally { if (pending.get(pendingKey) === task) pending.delete(pendingKey); }
}

export async function getMediaBlob(forumId: number, messageId: number, scope = captureAccountScope()): Promise<Blob | null> {
	assertAccountScope(scope);
	const peer = getInputPeerForForumId(forumId);
	const peerKind = peer instanceof Api.InputPeerChannel ? 'channel' : 'chat';
	const reference = JSON.stringify(['media', peerKind, forumId, messageId]);
	return getResource(scope, reference, MEDIA_TTL, async (previous, check) => {
		const client = await getClient(scope);
		const response = await runRead(scope, () => client.invoke(peer instanceof Api.InputPeerChannel
			? new Api.channels.GetMessages({ channel: new Api.InputChannel({ channelId: peer.channelId, accessHash: peer.accessHash }), id: [new Api.InputMessageID({ id: messageId })] })
			: new Api.messages.GetMessages({ id: [new Api.InputMessageID({ id: messageId })] })));
		check();
		const message = ('messages' in response ? response.messages : []).find((item): item is Api.Message => item instanceof Api.Message && item.id === messageId && (peerKind === 'channel' ? item.peerId instanceof Api.PeerChannel && String(item.peerId.channelId) === String(forumId) : item.peerId instanceof Api.PeerChat && String(item.peerId.chatId) === String(forumId)));
		const media = message?.media;
		const content = media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo ? media.photo : media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document ? media.document : undefined;
		if (!content) return { blob: null, revision: 'absent' };
		const revision = JSON.stringify([media?.className, String(content.id), String(content.accessHash), message?.editDate ?? 0, content.date, content instanceof Api.Document ? String(content.size) : '']);
		if (previous?.revision === revision && previous.blob) return { blob: previous.blob, revision };
		check();
		const data = await runRead(scope, () => client.downloadMedia(media!));
		check();
		const blob = data ? new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type: content instanceof Api.Photo ? 'image/jpeg' : content.mimeType }) : null;
		return { blob, revision };
	});
}
async function getAvatar(kind: 'forum' | 'user' | 'handle', id: number | string, scope: AccountScope): Promise<Blob | null> {
	return getResource(scope, JSON.stringify(['avatar', kind, id]), AVATAR_TTL, async (previous, check) => {
		const client = await getClient(scope);
		const target = kind === 'forum' ? getInputPeerForForumId(id as number) : id;
		const entity = await runRead(scope, () => client.getEntity(target));
		assertAccountScope(scope);
		check();
		const photo = 'photo' in entity ? entity.photo : undefined;
		if (!(photo instanceof Api.ChatPhoto || photo instanceof Api.UserProfilePhoto)) return { blob: null, revision: 'absent' };
		const revision = String(photo.photoId);
		if (previous?.revision === revision && previous.blob) return { blob: previous.blob, revision };
		const data = await runRead(scope, () => client.downloadProfilePhoto(entity));
		assertAccountScope(scope);
		return { blob: data ? new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type: 'image/jpeg' }) : null, revision };
	});
}
export function getForumAvatar(forumId: number, scope = captureAccountScope()): Promise<Blob | null> { return getAvatar('forum', forumId, scope); }
export function getUserAvatar(userId: number, scope = captureAccountScope()): Promise<Blob | null> { return getAvatar('user', userId, scope); }
/** Avatars by @username; works before joining, so the directory can show real photos. */
export function getForumAvatarByUsername(username: string, scope = captureAccountScope()): Promise<Blob | null> { return getAvatar('handle', username.replace(/^@/, ''), scope); }

export function useBlobUrl(blob: Blob | null | undefined): string | undefined {
	const [owned, setOwned] = useState<{ blob: Blob; url: string }>();
	useEffect(() => {
		if (!blob) { setOwned(undefined); return; }
		const owner = blobOwners.get(blob);
		if (owner && (blocked.has(owner.accountId) || owner.generation !== (generations.get(owner.accountId) ?? 0))) { setOwned(undefined); return; }
		const url = URL.createObjectURL(blob);
		let live = true;
		const revoke = () => { if (live) { URL.revokeObjectURL(url); live = false; } };
		const invalidate = (accountId: string) => { if (!owner || accountId === owner.accountId) { revoke(); setOwned(undefined); } };
		urlInvalidators.add(invalidate);
		setOwned({ blob, url });
		return () => { urlInvalidators.delete(invalidate); revoke(); };
	}, [blob]);
	return owned?.blob === blob ? owned?.url : undefined;
}

// Shared rendering hook; requests return blobs and the consuming mount owns its URL.
export function useForumAvatarUrl(forumId: number | undefined): string | undefined {
	const [result, setResult] = useState<{ id: number; blob: Blob | null }>();
	useEffect(() => {
		if (forumId === undefined) return;
		let active = true;
		let scope: AccountScope;
		try { scope = captureAccountScope(); } catch { return; }
		getForumAvatar(forumId, scope).then(blob => { assertAccountScope(scope); if (active) setResult({ id: forumId, blob }); }).catch(() => { if (active) setResult(undefined); });
		return () => { active = false; };
	}, [forumId]);
	return useBlobUrl(result?.id === forumId ? result?.blob : undefined);
}

export function useForumAvatarByUsername(username: string | undefined): string | undefined {
	const [result, setResult] = useState<{ username: string; blob: Blob | null }>();
	useEffect(() => {
		if (!username) return;
		let active = true;
		let scope: AccountScope;
		try { scope = captureAccountScope(); } catch { return; }
		getForumAvatarByUsername(username, scope).then(blob => { assertAccountScope(scope); if (active) setResult({ username, blob }); }).catch(() => { if (active) setResult(undefined); });
		return () => { active = false; };
	}, [username]);
	return useBlobUrl(result?.username === username ? result?.blob : undefined);
}
