import Dexie, { type Table } from 'dexie';

export interface ResourceRow {
	key: string;
	accountId: string;
	reference: string;
	revision: string;
	blob: Blob | null;
	bytes: number;
	validatedAt: number;
	accessedAt: number;
}
interface EpochRow { accountId: string; value: number }

// The old database only held disposable caches. Never open its broken v1/v2
// primary-key upgrade, and never assign its unowned rows to a signed-in account.
export class ResourceDB extends Dexie {
	resources!: Table<ResourceRow, string>;
	epochs!: Table<EpochRow, string>;
	constructor(name = 'forumgram-resources-v1') {
		super(name);
		this.version(1).stores({ resources: 'key, accountId, [accountId+reference], accessedAt', epochs: 'accountId' });
	}
}
export const resourceDB = new ResourceDB();
export const DISK_MAX_BYTES = 128 * 1024 * 1024;
export const DISK_MAX_COUNT = 512;
export const DISK_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function discardLegacyDatabase(): Promise<void> {
	// Request deletion without ever opening the incompatible legacy schema.
	// Another old tab can block it; report that instead of hanging Clear forever.
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase('forumgram');
		const timeout = setTimeout(() => reject(new Error('Close older ForumGram tabs to finish discarding the legacy cache.')), 2000);
		request.onsuccess = () => { clearTimeout(timeout); resolve(); };
		request.onerror = () => { clearTimeout(timeout); reject(request.error); };
		request.onblocked = () => { clearTimeout(timeout); reject(new Error('An older tab is blocking legacy cache deletion.')); };
	});
}
export async function readCacheEpoch(accountId: string): Promise<number> {
	return (await resourceDB.epochs.get(accountId))?.value ?? 0;
}
export async function readResource(accountId: string, reference: string): Promise<ResourceRow | undefined> {
	return resourceDB.resources.where('[accountId+reference]').equals([accountId, reference]).first();
}
export async function writeResource(row: ResourceRow, expectedEpoch: number): Promise<boolean> {
	if (row.bytes > DISK_MAX_BYTES) return false;
	return resourceDB.transaction('rw', resourceDB.resources, resourceDB.epochs, async () => {
		if (await readCacheEpoch(row.accountId) !== expectedEpoch) return false;
		await resourceDB.resources.where('[accountId+reference]').equals([row.accountId, row.reference]).delete();
		await resourceDB.resources.put(row);
		const rows = await resourceDB.resources.orderBy('accessedAt').toArray();
		let bytes = rows.reduce((sum, item) => sum + item.bytes, 0);
		let count = rows.length;
		const remove: string[] = [];
		for (const item of rows) {
			if (item.accessedAt < Date.now() - DISK_MAX_AGE || bytes > DISK_MAX_BYTES || count > DISK_MAX_COUNT) {
				remove.push(item.key);
				bytes -= item.bytes;
				count--;
			}
		}
		await resourceDB.resources.bulkDelete(remove);
		return true;
	});
}
export async function purgeResources(accountId: string): Promise<void> {
	// IndexedDB serializes this transaction with every writer in every tab. A
	// queued writer either finishes before deletion or fails the epoch check.
	await resourceDB.transaction('rw', resourceDB.resources, resourceDB.epochs, async () => {
		const value = await readCacheEpoch(accountId);
		await resourceDB.epochs.put({ accountId, value: value + 1 });
		await resourceDB.resources.where('accountId').equals(accountId).delete();
	});
}
export async function resourceUsage(accountId: string): Promise<{ totalSize: number; fileCount: number }> {
	const rows = await resourceDB.resources.where('accountId').equals(accountId).toArray();
	return { totalSize: rows.reduce((n, row) => n + row.bytes, 0), fileCount: rows.filter(row => row.blob !== null).length };
}
