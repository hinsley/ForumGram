import Dexie, { Table } from 'dexie';

export interface ForumRow { id: number; accessHash?: string; username?: string; title: string; isForum: boolean; isPublic: boolean; about?: string; members?: number; lastActivity?: number; addedAt: number; }
export interface TopicRow { id: number; forumId: number; title: string; lastMsgId?: number; unreadCount?: number; pinned?: boolean; }
export interface MessageRow { id: number; forumId: number; topicId: number; fromId: number; date: number; textMD: string; threadTag?: string | null; threadId?: string | null; edited?: boolean; }
export interface KvRow { key: string; value: string; }
export interface AvatarRow { userId: number; blob: Blob; updatedAt: number; }

export class FGDB extends Dexie {
	forums!: Table<ForumRow, number>;
	topics!: Table<TopicRow, [number, number]>; // [forumId+id]
	messages!: Table<MessageRow, [number, number, number]>; // [forumId+topicId+id]
	kv!: Table<KvRow, string>;
	avatars!: Table<AvatarRow, number>;

	constructor() {
		super('forumgram');
		this.version(1).stores({
			forums: '++id, username, addedAt',
			topics: '[forumId+id], forumId',
			messages: '[topicId+id], topicId, date',
			kv: 'key',
		});
		this.version(2).stores({
			forums: '++id, username, addedAt',
			topics: '[forumId+id], forumId',
			messages: '[topicId+id], topicId, date',
			kv: 'key',
			avatars: 'userId',
		});
		this.version(3).stores({
			forums: '++id, username, addedAt',
			topics: '[forumId+id], forumId',
			messages: '[forumId+topicId+id], forumId, topicId, date, fromId, [forumId+fromId]',
			kv: 'key',
			avatars: 'userId',
		});
	}
}

export const db = new FGDB();

export async function kvSet(key: string, value: string) {
	await db.kv.put({ key, value });
}

export async function kvGet(key: string): Promise<string | null> {
	const row = await db.kv.get(key);
	return row?.value ?? null;
}

export async function getAvatarBlob(userId: number): Promise<Blob | null> {
	const row = await db.avatars.get(userId);
	return row?.blob ?? null;
}

export async function setAvatarBlob(userId: number, blob: Blob): Promise<void> {
	await db.avatars.put({ userId, blob, updatedAt: Date.now() });
}

export async function getForumAvatarBlob(forumId: number): Promise<Blob | null> {
	// Use negative IDs to distinguish forum avatars from user avatars.
	const avatarId = -Math.abs(forumId);
	const row = await db.avatars.get(avatarId);
	return row?.blob ?? null;
}

export async function setForumAvatarBlob(forumId: number, blob: Blob): Promise<void> {
	// Use negative IDs to distinguish forum avatars from user avatars.
	const avatarId = -Math.abs(forumId);
	await db.avatars.put({ userId: avatarId, blob, updatedAt: Date.now() });
}

export async function getActivityCount(forumId: number, userId: number): Promise<number | null> {
	const key = `act:${forumId}:${userId}`;
	const v = await kvGet(key);
	return v ? Number(v) : null;
}

export async function setActivityCount(forumId: number, userId: number, count: number): Promise<void> {
	const key = `act:${forumId}:${userId}`;
	await kvSet(key, String(count));
}