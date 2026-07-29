import { Api } from 'telegram';
import { getClient } from '@lib/telegram/client';
import { postCardFromTelegramMessage } from './protocol/search';
import type { PostCard } from './protocol/types';

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

function normalizeNonNegativeInteger(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizePageSize(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 10;
	return Math.min(TELEGRAM_PAGE_LIMIT, Math.max(1, Math.trunc(value)));
}

/** Translate oldest-first page coordinates into Telegram's newest-first search offset. */
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
 * Build a stable snapshot by combining indexed cards with exact supported cards that are visible
 * in recent history but have not reached Telegram search yet.
 */
async function getPostPaginationSnapshot(
	input: Api.TypeInputPeer,
	parentThreadId: string,
): Promise<PostPaginationSnapshot> {
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

	const reportedIndexedCount = normalizeNonNegativeInteger(
		typeof searchRes?.count === 'number'
			? searchRes.count
			: (Array.isArray(searchRes?.messages) ? searchRes.messages.length : 0),
	);
	const indexedUsers: Record<string, any> = {};
	(searchRes.users ?? []).forEach((user: any) => { indexedUsers[String(user.id)] = user; });
	const recentIndexedIds = new Set<number>();
	let rejectedRecentResults = 0;
	const recentMessages: any[] = searchRes.messages ?? [];
	for (const message of recentMessages) {
		const post = postCardFromTelegramMessage(message, indexedUsers);
		if (post && post.parentThreadId === parentThreadId) recentIndexedIds.add(post.messageId);
		else rejectedRecentResults++;
	}

	// Search count includes matching text that is not a supported ForumGram card. Remove every
	// rejected result visible in the indexed window, including explicitly unsupported versions.
	const indexedCount = Math.max(0, reportedIndexedCount - rejectedRecentResults);
	const oldestRecentIndexedId = recentIndexedIds.size > 0 ? Math.min(...recentIndexedIds) : 0;
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
		(historyRes.users ?? []).forEach((user: any) => { historyUsers[String(user.id)] = user; });
		const batch: any[] = (historyRes.messages ?? []).filter(
			(message: any) => message?.className === 'Message' || message?._ === 'message',
		);
		if (!batch.length) break;

		for (const message of batch) {
			const messageId = Number(message.id);
			if (oldestRecentIndexedId > 0 && messageId < oldestRecentIndexedId) {
				reachedIndexedWindow = true;
				break;
			}
			if (recentIndexedIds.has(messageId)) continue;
			const post = postCardFromTelegramMessage(message, historyUsers);
			if (post && post.parentThreadId === parentThreadId) freshByMessageId.set(messageId, post);
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

export async function countPostsInThread(input: Api.TypeInputPeer, parentThreadId: string): Promise<number> {
	const snapshot = await getPostPaginationSnapshot(input, parentThreadId);
	return snapshot.indexedCount + snapshot.freshPosts.length;
}

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
		(res.users ?? []).forEach((user: any) => { usersMap[String(user.id)] = user; });
		for (const message of (res.messages ?? [])) {
			const post = postCardFromTelegramMessage(message, usersMap);
			if (post && post.parentThreadId === parentThreadId) itemsByMessageId.set(post.messageId, post);
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
