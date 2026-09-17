// Re-exports the versioned card protocol. Discovery/search live in this
// module below; they are account-scoped and scheduler-aware.
export * from './protocol/types';
export * from './protocol/content';
export * from './protocol/codec';
import { BOARD_CARD_HEADER } from './protocol/envelope';
import { parseBoardCard, parseThreadCard, parsePostCard } from './protocol/codec';
import type { BoardMeta, ThreadMeta, PostCard } from './protocol/types';

import { Api } from 'telegram';
import { getClient } from '@lib/telegram/client';
import { accountQueryKey, assertAccountScope, captureAccountScope, type AccountScope } from '@lib/accountScope';
import { queryClient } from '@lib/queryClient';
import { runRead } from '@lib/telegram/requests';

// ---- Bounded Telegram discovery and live pagination ----

export interface CardDiscovery<T> {
	items: T[];
	/** Search is exhausted; recent-history reconciliation remains a bounded tail. */
	complete: boolean;
	nextOffsetId: number | null;
}

function checkRead(scope: AccountScope, signal?: AbortSignal) {
	assertAccountScope(scope);
	if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
}

export function peerCacheId(input: Api.TypeInputPeer): string {
	if ('channelId' in input) return `channel:${input.channelId}`;
	if ('chatId' in input) return `chat:${input.chatId}`;
	if ('userId' in input) return `user:${input.userId}`;
	throw new Error('Unsupported forum peer');
}

export function canonicalPage(value: number): number {
	return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function compareCards(a: { date?: number; messageId: number }, b: { date?: number; messageId: number }): number {
	return (a.date ?? 0) - (b.date ?? 0) || a.messageId - b.messageId;
}

export function mergeCards<T extends { id: string; messageId: number; date?: number }>(...groups: T[][]): T[] {
	const winners = new Map<string, T>();
	for (const group of groups) for (const card of group) {
		const previous = winners.get(card.id);
		if (!previous || card.messageId > previous.messageId) winners.set(card.id, card);
	}
	return [...winners.values()].sort((a, b) => compareCards(b, a));
}

function rawMessages(response: Api.messages.TypeMessages): Api.TypeMessage[] {
	if (!('messages' in response)) throw new Error('Telegram returned an unsupported messages response');
	return response.messages;
}

function nextOffset(messages: Api.TypeMessage[], previous: number): number | null {
	let next = Infinity;
	for (const message of messages) {
		const id = Number(message.id);
		if (Number.isSafeInteger(id) && id > 0) next = Math.min(next, id);
	}
	if (!Number.isFinite(next)) return null;
	if (previous && next >= previous) throw new Error('Telegram pagination did not advance');
	return next;
}

async function search(input: Api.TypeInputPeer, q: string, limit: number, offsetId: number, scope: AccountScope, signal?: AbortSignal, priority: 'foreground' | 'background' = 'foreground', addOffset = 0): Promise<Api.messages.TypeMessages> {
	return runRead(scope, async () => {
		const client = await getClient(scope);
		checkRead(scope, signal);
		return client.invoke(new Api.messages.Search({ peer: input, q, limit, offsetId, addOffset, filter: new Api.InputMessagesFilterEmpty() }));
	}, signal, priority);
}

/** One shared 200-message reconciliation tail per peer, never one scan per board. */
async function recentHistory(input: Api.TypeInputPeer, scope: AccountScope, consumerSignal?: AbortSignal): Promise<Api.TypeMessage[]> {
	return queryClient.fetchQuery({
		queryKey: accountQueryKey(scope, 'recent-history', peerCacheId(input)),
		staleTime: 15_000, gcTime: 60_000, retry: false,
		queryFn: async ({ signal }) => {
			const messages: Api.TypeMessage[] = [];
			let offsetId = 0;
			for (let page = 0; page < 2; page++) {
				checkRead(scope, consumerSignal);
				const response = await runRead(scope, async () => {
					const client = await getClient(scope);
					checkRead(scope, signal);
					return client.invoke(new Api.messages.GetHistory({ peer: input, offsetId, addOffset: 0, limit: 100 }));
				}, signal);
				const batch = rawMessages(response);
				messages.push(...batch);
				const next = nextOffset(batch, offsetId);
				if (!next || batch.length < 100) break;
				offsetId = next;
			}
			return messages;
		},
	});
}

async function discover<T extends { id: string; messageId: number; date?: number }>(input: Api.TypeInputPeer, q: string, parse: (message: Api.TypeMessage) => T | null, queryLimit: number, scope: AccountScope, signal?: AbortSignal, offsetId = 0): Promise<CardDiscovery<T>> {
	checkRead(scope, signal);
	const items: T[] = [];
	const pages = Math.max(1, Math.min(5, Math.ceil(queryLimit / 100)));
	let complete = false;
	let cursor = offsetId;
	for (let page = 0; page < pages; page++) {
		const response = await search(input, q, 100, cursor, scope, signal);
		const batch = rawMessages(response);
		for (const message of batch) { const card = parse(message); if (card) items.push(card); }
		const next = nextOffset(batch, cursor);
		if (!next || batch.length < 100) { complete = true; break; }
		cursor = next;
	}
	if (!offsetId) {
		const recent = await recentHistory(input, scope, signal);
		checkRead(scope, signal);
		for (const message of recent) { const card = parse(message); if (card) items.push(card); }
	}
	return { items: mergeCards(items), complete, nextOffsetId: complete ? null : cursor };
}

export async function searchBoardCards(input: Api.TypeInputPeer, queryLimit = 200, scope = captureAccountScope(), signal?: AbortSignal, offsetId = 0): Promise<CardDiscovery<BoardMeta>> {
	return discover(input, BOARD_CARD_HEADER, (message) => {
		if (!(message instanceof Api.Message)) return null;
		const parsed = parseBoardCard(message.message ?? '');
		if (!parsed || !parsed.id) return null;
		return { id: parsed.id, version: parsed.version, messageId: message.id, creatorUserId: message.fromId instanceof Api.PeerUser ? Number(message.fromId.userId) : undefined, date: message.date, ...parsed.data };
	}, queryLimit, scope, signal, offsetId);
}

export async function searchThreadCards(input: Api.TypeInputPeer, parentBoardId: string, queryLimit = 200, scope = captureAccountScope(), signal?: AbortSignal, offsetId = 0): Promise<CardDiscovery<ThreadMeta>> {
	return discover(input, `fg.metadata.thread ${parentBoardId}`, (message) => {
		if (!(message instanceof Api.Message)) return null;
		const parsed = parseThreadCard(message.message ?? '');
		if (!parsed || !parsed.id || parsed.parentBoardId !== parentBoardId) return null;
		return { id: parsed.id, version: parsed.version, parentBoardId, messageId: message.id, creatorUserId: message.fromId instanceof Api.PeerUser ? Number(message.fromId.userId) : undefined, date: message.date, ...parsed.data };
	}, queryLimit, scope, signal, offsetId);
}

function postsFromResponse(response: Api.messages.TypeMessages, parentThreadId: string): PostCard[] {
	const users = new Map<string, Api.TypeUser>(('users' in response ? response.users : []).map((user) => [String(user.id), user]));
	const items: PostCard[] = [];
	for (const message of rawMessages(response)) {
		if (!(message instanceof Api.Message)) continue;
		const parsed = parsePostCard(message.message ?? '');
		if (!parsed || !parsed.id || parsed.parentThreadId !== parentThreadId) continue;
		const fromUserId = message.fromId instanceof Api.PeerUser ? Number(message.fromId.userId) : undefined;
		items.push({ id: parsed.id, version: parsed.version, parentThreadId, messageId: Number(message.id), fromUserId, user: users.get(String(fromUserId)), date: Number(message.date), content: parsed.data.content, media: message.media, groupedId: message.groupedId ? String(message.groupedId) : undefined });
	}
	return mergeCards(items);
}

/** Small progressive search. Exhausting the budget is unavailable, not a false empty summary. */
export async function getLastPostForThread(input: Api.TypeInputPeer, parentThreadId: string, queryLimit = 30, scope = captureAccountScope(), signal?: AbortSignal): Promise<PostCard | null> {
	let offsetId = 0;
	for (let page = 0; page < Math.max(1, Math.min(3, Math.ceil(queryLimit / 10))); page++) {
		const response = await search(input, `fg.post ${parentThreadId}`, 10, offsetId, scope, signal, 'background');
		const items = postsFromResponse(response, parentThreadId);
		if (items.length) return items[0];
		const batch = rawMessages(response);
		const next = nextOffset(batch, offsetId);
		if (!next || batch.length < 10) return null;
		offsetId = next;
	}
	throw new Error('Activity unavailable: recent search matches did not contain a valid post');
}

/** Raw search matches, not an exact number of valid ForumGram cards. */
export function searchResponseCount(response: Api.messages.TypeMessages): number {
	if ('count' in response && Number.isSafeInteger(response.count) && response.count >= 0) return response.count;
	if (response instanceof Api.messages.Messages) return response.messages.length;
	throw new Error('Telegram did not provide a usable search count');
}

export async function countPostsInThread(input: Api.TypeInputPeer, parentThreadId: string, scope = captureAccountScope(), signal?: AbortSignal): Promise<number> {
	const count = await queryClient.fetchQuery({
		queryKey: accountQueryKey(scope, 'forum-post-count', peerCacheId(input), parentThreadId),
		staleTime: 15_000, gcTime: 300_000, retry: false,
		queryFn: async ({ signal: countSignal }) => searchResponseCount(await search(input, `fg.post ${parentThreadId}`, 0, 0, scope, countSignal)),
	});
	checkRead(scope, signal);
	return count;
}

export interface PostPage {
	items: PostCard[];
	count: number;
	pages: number;
	page: number;
	countIsExact: false;
}

/** Live oldest-first numbered search windows. Inserts/deletes can reflow pages;
 * counts describe raw text matches and filtered windows may contain fewer posts.
 */
export async function fetchPostPage(input: Api.TypeInputPeer, parentThreadId: string, page: number, pageSize = 10, scope = captureAccountScope(), signal?: AbortSignal): Promise<PostPage> {
	checkRead(scope, signal);
	if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Invalid post page size');
	let count = await countPostsInThread(input, parentThreadId, scope, signal);
	let pages = Math.max(1, Math.ceil(count / pageSize));
	let canonical = Math.min(canonicalPage(page), pages);
	if (!count) return { items: [], count, pages, page: canonical, countIsExact: false };
	let response: Api.messages.TypeMessages = new Api.messages.Messages({ messages: [], chats: [], users: [] });
	for (let attempt = 0; attempt < 2; attempt++) {
		const addOffset = Math.max(0, count - canonical * pageSize);
		const limit = Math.min(pageSize, count - (canonical - 1) * pageSize);
		response = await search(input, `fg.post ${parentThreadId}`, limit, 0, scope, signal, 'foreground', addOffset);
		// A bare Messages page has no total; its window length must not replace the count-only result.
		const liveCount = 'count' in response ? searchResponseCount(response) : count;
		if (liveCount === count) break;
		if (attempt === 1) throw new Error('The thread changed while loading. Please refresh the page.');
		count = liveCount;
		pages = Math.max(1, Math.ceil(count / pageSize));
		canonical = Math.min(canonical, pages);
		if (!count) return { items: [], count, pages, page: canonical, countIsExact: false };
	}
	checkRead(scope, signal);
	return { items: postsFromResponse(response, parentThreadId).sort(compareCards), count, pages, page: canonical, countIsExact: false };
}
