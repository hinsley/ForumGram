import { Api } from 'telegram';
import { getClient } from '@lib/telegram/client';
import { parsePostCard, type PostCard } from './protocol';

export * from './protocol';

const TELEGRAM_PAGE_LIMIT = 100;
const MAX_FRESH_HISTORY_PAGES = 30;

type PostPaginationSnapshot = {
	indexedCount: number;
	freshPosts: PostCard[];
};

export type PostPageWindow = {
	count: number;
	page: number;
	pageSize: number;
	pages: number;
	indexedAddOffset: number;
	indexedLimit: number;
	freshStart: number;
	freshEnd: number;
};

function toPostCard(message: any, parentThreadId: string, usersMap: Record<string, any>): PostCard | null {
	const parsed = parsePostCard(message?.message ?? '');
	if (!parsed || parsed.parentThreadId !== parentThreadId) return null;
	const fromUserId: number | undefined = message.fromId?.userId ? Number(message.fromId.userId) : undefined;
	return {
		id: parsed.id,
		parentThreadId,
		messageId: Number(message.id),
		fromUserId,
		user: fromUserId ? usersMap[String(fromUserId)] : undefined,
		date: Number(message.date),
		content: parsed.data.content,
		media: message.media,
		groupedId: message.groupedId ? String(message.groupedId) : undefined,
	};
}

function normalizeNonNegativeInteger(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizePageSize(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 10;
	return Math.min(TELEGRAM_PAGE_LIMIT, Math.max(1, Math.trunc(value)));
}

/**
 * Translate oldest-first page coordinates into Telegram's newest-first search offset,
 * while reserving the newest slots for posts that exist in history but are not indexed yet.
 */
export function getPostPageWindow(
	indexedCountValue: number,
	freshCountValue: number,
	requestedPageValue: number,
	pageSizeValue: number = 10,
): PostPageWindow {
	const indexedCount = normalizeNonNegativeInteger(indexedCountValue);
	const freshCount = normalizeNonNegativeInteger(freshCountValue);
	const pageSize = normalizePageSize(pageSizeValue);
	const count = indexedCount + freshCount;
	const pages = Math.max(1, Math.ceil(count / pageSize));
	const requestedPage = Number.isFinite(requestedPageValue) ? Math.trunc(requestedPageValue) : 1;
	const page = Math.min(Math.max(1, requestedPage), pages);
	const pageStart = (page - 1) * pageSize;
	const pageEnd = Math.min(count, pageStart + pageSize);
	const indexedStart = Math.min(pageStart, indexedCount);
	const indexedEnd = Math.min(pageEnd, indexedCount);
	const indexedLimit = Math.max(0, indexedEnd - indexedStart);
	const indexedAddOffset = Math.max(0, indexedCount - indexedEnd);
	const freshStart = Math.max(0, pageStart - indexedCount);
	const freshEnd = Math.max(freshStart, pageEnd - indexedCount);

	return { count, page, pageSize, pages, indexedAddOffset, indexedLimit, freshStart, freshEnd };
}

/**
 * Telegram search can lag behind chat history for newly sent messages. Build a stable snapshot
 * by counting indexed results and adding exact ForumGram post cards seen in recent history but
 * absent from the newest indexed search window.
 */
async function getPostPaginationSnapshot(input: Api.TypeInputPeer, parentThreadId: string): Promise<PostPaginationSnapshot> {
	const client = await getClient();
	const q = `fg.post ${parentThreadId}`;
	const searchRes: any = await client.invoke(new Api.messages.Search({
		peer: input,
		q,
		offsetId: 0,
		addOffset: 0,
		limit: TELEGRAM_PAGE_LIMIT,
		filter: new Api.InputMessagesFilterEmpty(),
	} as any));

	const indexedCount = normalizeNonNegativeInteger(
		typeof searchRes?.count === 'number'
			? searchRes.count
			: (Array.isArray(searchRes?.messages) ? searchRes.messages.length : 0),
	);
	const indexedUsers: Record<string, any> = {};
	(searchRes.users ?? []).forEach((u: any) => { indexedUsers[String(u.id)] = u; });
	const recentIndexedIds = new Set<number>();
	for (const message of (searchRes.messages ?? [])) {
		const post = toPostCard(message, parentThreadId, indexedUsers);
		if (post) recentIndexedIds.add(post.messageId);
	}

	// If the search count is nonzero but no result parses as this thread, do not infer which
	// history entries are unindexed. The exact ForumGram parser remains the source of truth.
	if (indexedCount > 0 && recentIndexedIds.size === 0) {
		return { indexedCount, freshPosts: [] };
	}

	const oldestRecentIndexedId = recentIndexedIds.size > 0
		? Math.min(...recentIndexedIds)
		: 0;
	const freshByMessageId = new Map<number, PostCard>();
	const historyUsers: Record<string, any> = {};
	let offsetId = 0;
	let pagesScanned = 0;
	let reachedIndexedWindow = false;

	while (pagesScanned < MAX_FRESH_HISTORY_PAGES && !reachedIndexedWindow) {
		const historyRes: any = await client.invoke(new Api.messages.GetHistory({
			peer: input,
			offsetId,
			addOffset: 0,
			limit: TELEGRAM_PAGE_LIMIT,
		} as any));
		(historyRes.users ?? []).forEach((u: any) => { historyUsers[String(u.id)] = u; });
		const batch: any[] = (historyRes.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
		if (!batch.length) break;

		for (const message of batch) {
			const messageId = Number(message.id);
			if (oldestRecentIndexedId > 0 && messageId < oldestRecentIndexedId) {
				reachedIndexedWindow = true;
				break;
			}
			if (recentIndexedIds.has(messageId)) continue;
			const post = toPostCard(message, parentThreadId, historyUsers);
			if (post) freshByMessageId.set(messageId, post);
		}

		const nextOffsetId = Number(batch[batch.length - 1].id);
		if (!Number.isFinite(nextOffsetId) || nextOffsetId === offsetId) break;
		offsetId = nextOffsetId;
		pagesScanned++;
	}

	const freshPosts = [...freshByMessageId.values()].sort((a, b) => {
		const dateDelta = (a.date ?? 0) - (b.date ?? 0);
		return dateDelta !== 0 ? dateDelta : a.messageId - b.messageId;
	});
	return { indexedCount, freshPosts };
}

/** Count indexed and newly sent, not-yet-indexed ForumGram posts in a thread. */
export async function countPostsInThread(input: Api.TypeInputPeer, parentThreadId: string): Promise<number> {
	const snapshot = await getPostPaginationSnapshot(input, parentThreadId);
	return snapshot.indexedCount + snapshot.freshPosts.length;
}

/**
 * Fetch a specific oldest-first page. Indexed posts come from messages.search; newly sent
 * unindexed posts are appended from recent history so the last page updates immediately.
 */
export async function fetchPostPage(
	input: Api.TypeInputPeer,
	parentThreadId: string,
	page: number,
	pageSize: number = 10,
): Promise<{ items: PostCard[]; count: number; pages: number; page: number }> {
	const client = await getClient();
	const q = `fg.post ${parentThreadId}`;
	const snapshot = await getPostPaginationSnapshot(input, parentThreadId);
	const window = getPostPageWindow(snapshot.indexedCount, snapshot.freshPosts.length, page, pageSize);
	const itemsByMessageId = new Map<number, PostCard>();

	if (window.indexedLimit > 0) {
		const res: any = await client.invoke(new Api.messages.Search({
			peer: input,
			q,
			offsetId: 0,
			addOffset: window.indexedAddOffset,
			limit: window.indexedLimit,
			filter: new Api.InputMessagesFilterEmpty(),
		} as any));
		const usersMap: Record<string, any> = {};
		(res.users ?? []).forEach((u: any) => { usersMap[String(u.id)] = u; });
		for (const message of (res.messages ?? [])) {
			const post = toPostCard(message, parentThreadId, usersMap);
			if (post) itemsByMessageId.set(post.messageId, post);
		}
	}

	for (const post of snapshot.freshPosts.slice(window.freshStart, window.freshEnd)) {
		itemsByMessageId.set(post.messageId, post);
	}

	const items = [...itemsByMessageId.values()].sort((a, b) => {
		const dateDelta = (a.date ?? 0) - (b.date ?? 0);
		return dateDelta !== 0 ? dateDelta : a.messageId - b.messageId;
	});
	return { items, count: window.count, pages: window.pages, page: window.page };
}
