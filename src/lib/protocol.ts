import { Api } from 'telegram';
import { getClient } from '@lib/telegram/client';

export interface BoardMeta {
	// Permanent ID (hash)
	id: string;
	// Telegram message id that carries this metadata card
	messageId: number;
	// User id of creator
	creatorUserId?: number;
	// Epoch seconds
	date?: number;
	// User content
	title: string;
	description?: string;
}

export interface ThreadMeta {
	id: string;
	parentBoardId: string;
	messageId: number;
	creatorUserId?: number;
	date?: number;
	title: string;
}

export interface PostCard {
	id: string;
	parentThreadId: string;
	messageId: number;
	fromUserId?: number;
	date?: number;
	content: string;
	media?: any; // raw GramJS media for reuse when editing
	groupedId?: string;
}

export function generateIdHash(length: number = 16): string {
	// Generate base64url string without padding
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
	return b64;
}

// ---- Compose / Parse helpers ----

export function composeBoardCard(id: string, data: { title: string; description?: string }): string {
	const payload = JSON.stringify({ title: data.title, description: data.description ?? '' });
	return `fg.metadata.board\n${id}\n${payload}`;
}

export function parseBoardCard(text: string): { id: string; data: { title: string; description?: string } } | null {
	const lines = (text ?? '').split(/\n/);
	if (lines.length < 3) return null;
	if (lines[0] !== 'fg.metadata.board') return null;
	const id = lines[1]?.trim();
	try {
		const jsonStr = lines.slice(2).join('\n');
		const obj = JSON.parse(jsonStr);
		return { id, data: { title: obj.title ?? '', description: obj.description ?? '' } };
	} catch {
		return null;
	}
}

export function composeThreadCard(id: string, parentBoardId: string, data: { title: string }): string {
	const payload = JSON.stringify({ title: data.title });
	return `fg.metadata.thread\n${id}\nparent:${parentBoardId}\n${payload}`;
}

export function parseThreadCard(text: string): { id: string; parentBoardId: string; data: { title: string } } | null {
	const lines = (text ?? '').split(/\n/);
	if (lines.length < 4) return null;
	if (lines[0] !== 'fg.metadata.thread') return null;
	const id = lines[1]?.trim();
	const parentLine = lines[2] ?? '';
	if (!parentLine.startsWith('parent:')) return null;
	const parentBoardId = parentLine.slice('parent:'.length).trim();
	try {
		const jsonStr = lines.slice(3).join('\n');
		const obj = JSON.parse(jsonStr);
		return { id, parentBoardId, data: { title: obj.title ?? '' } };
	} catch {
		return null;
	}
}

export function composePostCard(id: string, parentThreadId: string, data: { content: string }): string {
	const payload = JSON.stringify({ content: data.content });
	return `fg.post\n${id}\nparent:${parentThreadId}\n${payload}`;
}

export function parsePostCard(text: string): { id: string; parentThreadId: string; data: { content: string } } | null {
	const lines = (text ?? '').split(/\n/);
	if (lines.length < 4) return null;
	if (lines[0] !== 'fg.post') return null;
	const id = lines[1]?.trim();
	const parentLine = lines[2] ?? '';
	if (!parentLine.startsWith('parent:')) return null;
	const parentThreadId = parentLine.slice('parent:'.length).trim();
	try {
		const jsonStr = lines.slice(3).join('\n');
		const obj = JSON.parse(jsonStr);
		return { id, parentThreadId, data: { content: obj.content ?? '' } };
	} catch {
		return null;
	}
}

// ---- Telegram search helpers ----

export async function searchBoardCards(input: Api.TypeInputPeer, queryLimit = 100): Promise<BoardMeta[]> {
	const client = await getClient();
	const res: any = await client.invoke(new Api.messages.Search({ peer: input, q: 'fg.metadata.board', limit: queryLimit, filter: new Api.InputMessagesFilterEmpty() }));
	const usersMap: Record<string, any> = {};
	(res.users ?? []).forEach((u: any) => { usersMap[String(u.id)] = u; });
	const items: BoardMeta[] = [];
	const messages: any[] = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
	for (const m of messages) {
		const parsed = parseBoardCard(m.message ?? '');
		if (!parsed) continue;
		const creatorUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
		items.push({ id: parsed.id, messageId: Number(m.id), creatorUserId, date: Number(m.date), title: parsed.data.title, description: parsed.data.description });
	}
	return items;
}

export async function searchThreadCards(input: Api.TypeInputPeer, parentBoardId: string, queryLimit = 200): Promise<ThreadMeta[]> {
	const client = await getClient();
	const q = `fg.metadata.thread ${parentBoardId}`;
	const res: any = await client.invoke(new Api.messages.Search({ peer: input, q, limit: queryLimit, filter: new Api.InputMessagesFilterEmpty() }));
	const items: ThreadMeta[] = [];
	const messages: any[] = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
	for (const m of messages) {
		const parsed = parseThreadCard(m.message ?? '');
		if (!parsed) continue;
		if (parsed.parentBoardId !== parentBoardId) continue;
		const creatorUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
		items.push({ id: parsed.id, parentBoardId, messageId: Number(m.id), creatorUserId, date: Number(m.date), title: parsed.data.title });
	}
	return items;
}

export async function searchPostCards(input: Api.TypeInputPeer, parentThreadId: string, queryLimit = 500): Promise<PostCard[]> {
	const client = await getClient();
	const q = `fg.post ${parentThreadId}`;
	const res: any = await client.invoke(new Api.messages.Search({ peer: input, q, limit: queryLimit, filter: new Api.InputMessagesFilterEmpty() }));
	const items: PostCard[] = [];
	const messages: any[] = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
	for (const m of messages) {
		const parsed = parsePostCard(m.message ?? '');
		if (!parsed) continue;
		if (parsed.parentThreadId !== parentThreadId) continue;
		const fromUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
		items.push({ id: parsed.id, parentThreadId, messageId: Number(m.id), fromUserId, date: Number(m.date), content: parsed.data.content, media: m.media, groupedId: m.groupedId ? String(m.groupedId) : undefined });
	}
	return items;
}

