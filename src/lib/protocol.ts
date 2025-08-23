import { Api } from 'telegram';
import { getClient } from '@lib/telegram/client';

export interface BoardMeta {
	// Permanent ID (hash).
	id: string;
	// Telegram message id that carries this metadata card.
	messageId: number;
	// User id of creator.
	creatorUserId?: number;
	// Epoch seconds.
	date?: number;
	// User content.
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
	user?: any;
	date?: number;
	content: string;
	media?: any; // raw GramJS media for reuse when editing.
	groupedId?: string;
}

export function generateIdHash(length: number = 16): string {
	// Generate base64url string without padding.
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
	return b64;
}

// ---- Compose / Parse helpers ----

/**
 * Escapes post content for ForumGram prior to JSON serialization so that Telegram/Markdown
 * special characters do not alter formatting when the message is stored and later rendered.
 *
 * Transformation (before JSON):
 *   * ~ ` _ -> prefix with a single backslash if not already escaped.
 *   \\ -> double every existing backslash to preserve user-intended escapes.
 * Double-quotes are left untouched here; JSON serialization will escape them.
 */
export function escapePostContentForForumGram(input: string): string {
	if (!input) return '';
	// Greedy: first double original backslashes.
	let out = input.replace(/\\/g, '\\\\');
	// Then map special characters to ForumGram tokens.
	out = out.replace(/\*/g, '\\ast');
	out = out.replace(/~/g, '\\til');
	out = out.replace(/`/g, '\\btk');
	out = out.replace(/_/g, '\\und');
	return out;
}

/**
 * Reverses ForumGram escaping after JSON parsing to restore the author's original content.
 *
 * Steps (after JSON parse):
 *   1) For runs of backslashes immediately before a special char (* ~ ` _), remove one
 *      backslash if the run length is odd (undo the single prefix added during escaping).
 *   2) Collapse doubled backslashes to single backslashes (undo backslash doubling).
 */
export function unescapePostContentFromForumGram(input: string): string {
	if (!input) return '';
	let out = input;
	// Reverse token mapping first to avoid touching token backslashes when collapsing doubles.
	out = out.replace(/\\ast/g, '*');
	out = out.replace(/\\til/g, '~');
	out = out.replace(/\\btk/g, '`');
	out = out.replace(/\\und/g, '_');
	// Finally, collapse doubled backslashes back to a single backslash.
	out = out.replace(/\\\\/g, '\\');
	return out;
}

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
	const escapedContent = escapePostContentForForumGram(data.content);
	const payload = JSON.stringify({ content: escapedContent });
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
		const restoredContent = unescapePostContentFromForumGram(obj.content ?? '');
		return { id, parentThreadId, data: { content: restoredContent } };
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
	const seenMsgIds = new Set<number>();
	const messages: any[] = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
	for (const m of messages) {
		const parsed = parseBoardCard(m.message ?? '');
		if (!parsed) continue;
		const msgId = Number(m.id);
		seenMsgIds.add(msgId);
		const creatorUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
		items.push({ id: parsed.id, messageId: msgId, creatorUserId, date: Number(m.date), title: parsed.data.title, description: parsed.data.description });
	}

	// Fallback: scan recent history for additional board cards not yet indexed by search.
	if (items.length < queryLimit) {
		let offsetId = 0;
		const pageSize = Math.min(100, queryLimit);
		let pages = 0;
		while (items.length < queryLimit && pages < 30) {
			const page: any = await client.invoke(new Api.messages.GetHistory({ peer: input, offsetId, addOffset: 0, limit: pageSize }));
			const batch: any[] = (page.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
			if (!batch.length) break;
			for (const m of batch) {
				const msgId = Number(m.id);
				if (seenMsgIds.has(msgId)) continue;
				const parsed = parseBoardCard(m.message ?? '');
				if (!parsed) continue;
				const creatorUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
				seenMsgIds.add(msgId);
				items.push({ id: parsed.id, messageId: msgId, creatorUserId, date: Number(m.date), title: parsed.data.title, description: parsed.data.description });
				if (items.length >= queryLimit) break;
			}
			offsetId = Number(batch[batch.length - 1].id);
			pages++;
		}
	}

	return items;
}

export async function searchThreadCards(input: Api.TypeInputPeer, parentBoardId: string, queryLimit = 200): Promise<ThreadMeta[]> {
	const client = await getClient();
	const q = `fg.metadata.thread ${parentBoardId}`;
	const res: any = await client.invoke(new Api.messages.Search({ peer: input, q, limit: queryLimit, filter: new Api.InputMessagesFilterEmpty() }));
	const items: ThreadMeta[] = [];
	const seenMsgIds = new Set<number>();
	const messages: any[] = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
	for (const m of messages) {
		const parsed = parseThreadCard(m.message ?? '');
		if (!parsed) continue;
		if (parsed.parentBoardId !== parentBoardId) continue;
		const msgId = Number(m.id);
		seenMsgIds.add(msgId);
		const creatorUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
		items.push({ id: parsed.id, parentBoardId, messageId: msgId, creatorUserId, date: Number(m.date), title: parsed.data.title });
	}

	// Fallback: scan recent history for additional thread cards belonging to this board.
	if (items.length < queryLimit) {
		let offsetId = 0;
		const pageSize = Math.min(100, queryLimit);
		let pages = 0;
		while (items.length < queryLimit && pages < 30) {
			const page: any = await client.invoke(new Api.messages.GetHistory({ peer: input, offsetId, addOffset: 0, limit: pageSize }));
			const batch: any[] = (page.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
			if (!batch.length) break;
			for (const m of batch) {
				const msgId = Number(m.id);
				if (seenMsgIds.has(msgId)) continue;
				const parsed = parseThreadCard(m.message ?? '');
				if (!parsed) continue;
				if (parsed.parentBoardId !== parentBoardId) continue;
				const creatorUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
				seenMsgIds.add(msgId);
				items.push({ id: parsed.id, parentBoardId, messageId: msgId, creatorUserId, date: Number(m.date), title: parsed.data.title });
				if (items.length >= queryLimit) break;
			}
			offsetId = Number(batch[batch.length - 1].id);
			pages++;
		}
	}

	return items;
}

export async function searchPostCards(input: Api.TypeInputPeer, parentThreadId: string, queryLimit = 500): Promise<PostCard[]> {
	const client = await getClient();
	const q = `fg.post ${parentThreadId}`;
	const res: any = await client.invoke(new Api.messages.Search({ peer: input, q, limit: queryLimit, filter: new Api.InputMessagesFilterEmpty() }));
	const items: PostCard[] = [];
	const seenMsgIds = new Set<number>();
	const usersMap: Record<string, any> = {};
	(res.users ?? []).forEach((u: any) => { usersMap[String(u.id)] = u; });
	const messages: any[] = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
	for (const m of messages) {
		const parsed = parsePostCard(m.message ?? '');
		if (!parsed) continue;
		if (parsed.parentThreadId !== parentThreadId) continue;
		const fromUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
		const msgId = Number(m.id);
		seenMsgIds.add(msgId);
		items.push({ id: parsed.id, parentThreadId, messageId: msgId, fromUserId, user: fromUserId ? usersMap[String(fromUserId)] : undefined, date: Number(m.date), content: parsed.data.content, media: m.media, groupedId: m.groupedId ? String(m.groupedId) : undefined });
	}
	return items;
}

/**
 * Returns the most recent post for a given thread, or null if none exists.
 * Uses a modest search limit and then picks the latest by date to avoid
 * relying on server-side search ordering.
 */
export async function getLastPostForThread(input: Api.TypeInputPeer, parentThreadId: string, queryLimit: number = 100): Promise<PostCard | null> {
    const items = await searchPostCards(input, parentThreadId, queryLimit);
    if (!items.length) return null;
    let latest: PostCard | null = null;
    for (const p of items) {
        if (!latest || (p.date ?? 0) > (latest.date ?? 0)) latest = p;
    }
    return latest;
}

/**
 * Returns the most recent post across all threads within a board.
 * Scans a limited number of most recent threads to balance performance.
 */
export async function getLastPostForBoard(
    input: Api.TypeInputPeer,
    parentBoardId: string,
    perThreadPostQueryLimit: number = 50,
    maxThreadsToScan: number = 30,
): Promise<PostCard | null> {
    const threads = await searchThreadCards(input, parentBoardId, 500);
    // Prioritize newest threads first (by creation date as a heuristic)
    const sorted = [...threads].sort((a, b) => (b.date ?? 0) - (a.date ?? 0)).slice(0, Math.max(1, maxThreadsToScan));
    const results = await Promise.all(sorted.map(t => getLastPostForThread(input, t.id, perThreadPostQueryLimit)));
    const nonNull = results.filter(Boolean) as PostCard[];
    if (!nonNull.length) return null;
    let latest: PostCard | null = null;
    for (const p of nonNull) {
        if (!latest || (p.date ?? 0) > (latest.date ?? 0)) latest = p;
    }
    return latest;
}

// ---- Pagination helpers ----

/**
 * Count posts within a thread using Telegram's messages.search count field.
 */
export async function countPostsInThread(input: Api.TypeInputPeer, parentThreadId: string): Promise<number> {
    const client = await getClient();
    const q = `fg.post ${parentThreadId}`;
    // Use limit=0 to request only the count; Telegram suggests conflictingly
	// that 0 will faux-reset itself to 10 and also that it will not do that in
	// two separate places in the documentation.
    // Fall back to limit=1 if count is absent.
    const res: any = await client.invoke(new Api.messages.Search({ peer: input, q, limit: 0, filter: new Api.InputMessagesFilterEmpty() }));
    const countFromRes = (typeof res?.count === 'number') ? res.count : undefined;
    if (typeof countFromRes === 'number') return countFromRes;
    try {
        const res2: any = await client.invoke(new Api.messages.Search({ peer: input, q, limit: 1, filter: new Api.InputMessagesFilterEmpty() }));
        return (typeof res2?.count === 'number') ? res2.count : (Array.isArray(res2?.messages) ? res2.messages.length : 0);
    } catch {
        return 0;
    }
}

/**
 * Fetch a specific page of posts (oldest-first pagination) using addOffset and negative limit.
 * Page 1 is the oldest page. Page size defaults to 10.
 * See Telegram offset semantics: core.telegram.org/api/offsets
 */
export async function fetchPostPage(
    input: Api.TypeInputPeer,
    parentThreadId: string,
    page: number,
    pageSize: number = 10,
): Promise<{ items: PostCard[]; count: number; pages: number }> {
    const client = await getClient();
    const q = `fg.post ${parentThreadId}`;
    const count = await countPostsInThread(input, parentThreadId);
    const totalPages = Math.max(1, Math.ceil(Math.max(0, count) / pageSize));
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const lastPageLength = count === 0 ? 0 : ((count - 1) % pageSize) + 1;
    const isLastPage = clampedPage === totalPages;
    const addOffset = (count === 0)
        ? 0
        : (isLastPage ? 0 : (lastPageLength + Math.max(0, (totalPages - clampedPage - 1)) * pageSize));
    const limit = count === 0
        ? 0
        : (isLastPage ? lastPageLength : pageSize);

    const res: any = await client.invoke(new Api.messages.Search({
        peer: input,
        q,
        addOffset,
        limit,
        filter: new Api.InputMessagesFilterEmpty(),
    } as any));

    const usersMap: Record<string, any> = {};
    (res.users ?? []).forEach((u: any) => { usersMap[String(u.id)] = u; });
    const messages: any[] = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
    const items: PostCard[] = [];
    for (const m of messages) {
        const parsed = parsePostCard(m.message ?? '');
        if (!parsed) continue;
        if (parsed.parentThreadId !== parentThreadId) continue;
        const fromUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
        const msgId = Number(m.id);
        items.push({ id: parsed.id, parentThreadId, messageId: msgId, fromUserId, user: fromUserId ? usersMap[String(fromUserId)] : undefined, date: Number(m.date), content: parsed.data.content, media: m.media, groupedId: m.groupedId ? String(m.groupedId) : undefined });
    }
    // Ensure oldest-first order within page.
    items.sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
    return { items, count, pages: totalPages };
}

