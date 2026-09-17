import { queryOptions } from '@tanstack/react-query';
import { accountQueryKey, assertAccountScope, onAccountDispose, type AccountScope } from '@lib/accountScope';
import { queryClient } from '@lib/queryClient';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { getLastPostForThread, mergeCards, peerCacheId, searchBoardCards, searchThreadCards, type BoardMeta, type ThreadMeta, type CardDiscovery } from '@lib/protocol';

const boardChanges = new Map<string, Map<string, { card: BoardMeta | null }>>();
const threadChanges = new Map<string, Map<string, { card: ThreadMeta | null }>>();
let reservedChanges = 0;

export function reserveMetadataChange(scope: AccountScope): () => void {
	assertAccountScope(scope);
	let pending = reservedChanges;
	for (const changes of boardChanges.values()) pending += changes.size;
	for (const changes of threadChanges.values()) pending += changes.size;
	if (pending >= 200) throw new Error('Metadata changes are still syncing. Refresh this forum before making more changes.');
	reservedChanges++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (!scope.signal.aborted) reservedChanges--;
	};
}

function reconcileBoards(scope: AccountScope, forumId: number, data: CardDiscovery<BoardMeta>, confirm = true): CardDiscovery<BoardMeta> {
	const key = `${scope.accountId}:${scope.generation}:${forumId}`;
	const changes = boardChanges.get(key);
	if (!changes) return data;
	const items = new Map(data.items.map((board) => [board.id, board]));
	for (const [id, change] of changes) {
		const found = items.get(id);
		if (confirm && (change.card ? found?.messageId === change.card.messageId && found.title === change.card.title && found.description === change.card.description : data.complete && !found)) {
			changes.delete(id);
			continue;
		}
		if (change.card) items.set(id, change.card); else items.delete(id);
	}
	if (!changes.size) boardChanges.delete(key);
	return { ...data, items: mergeCards([...items.values()]) };
}

export function recordBoardChange(scope: AccountScope, forumId: number, id: string, card: BoardMeta | null): void {
	assertAccountScope(scope);
	const key = `${scope.accountId}:${scope.generation}:${forumId}`;
	let changes = boardChanges.get(key);
	if (!changes) { changes = new Map(); boardChanges.set(key, changes); }
	changes.set(id, { card });
	queryClient.setQueryData(boardsQueryOptions(scope, forumId).queryKey, (data) => {
		const previous = data ?? { items: [], complete: false, nextOffsetId: null };
		const items = previous.items.filter((board) => board.id !== id);
		return { ...previous, items: card ? mergeCards(items, [card]) : items };
	});
}

function reconcileThreads(scope: AccountScope, forumId: number, boardId: string, data: CardDiscovery<ThreadMeta>, confirm = true): CardDiscovery<ThreadMeta> {
	const key = `${scope.accountId}:${scope.generation}:${forumId}:${boardId}`;
	const changes = threadChanges.get(key);
	if (!changes) return data;
	const items = new Map(data.items.map((thread) => [thread.id, thread]));
	for (const [id, change] of changes) {
		const found = items.get(id);
		if (confirm && (change.card ? found?.messageId === change.card.messageId && found.title === change.card.title : data.complete && !found)) { changes.delete(id); continue; }
		if (change.card) items.set(id, change.card); else items.delete(id);
	}
	if (!changes.size) threadChanges.delete(key);
	return { ...data, items: mergeCards([...items.values()]) };
}

export function recordThreadChange(scope: AccountScope, forumId: number, boardId: string, id: string, card: ThreadMeta | null): void {
	assertAccountScope(scope);
	const key = `${scope.accountId}:${scope.generation}:${forumId}:${boardId}`;
	let changes = threadChanges.get(key);
	if (!changes) { changes = new Map(); threadChanges.set(key, changes); }
	changes.set(id, { card });
	queryClient.setQueryData(threadsQueryOptions(scope, forumId, boardId).queryKey, (data) => {
		const previous = data ?? { items: [], complete: false, nextOffsetId: null };
		const items = previous.items.filter((thread) => thread.id !== id);
		return { ...previous, items: card ? mergeCards(items, [card]) : items };
	});
}

export function boardsQueryOptions(scope: AccountScope, forumId: number) {
	return queryOptions({
		queryKey: accountQueryKey(scope, 'forum', forumId, 'boards'),
		queryFn: async ({ signal }) => reconcileBoards(scope, forumId, await searchBoardCards(getInputPeerForForumId(forumId), 200, scope, signal)),
		staleTime: 60_000, gcTime: 300_000, retry: false,
	});
}

export function threadsQueryOptions(scope: AccountScope, forumId: number, boardId: string) {
	return queryOptions({
		queryKey: accountQueryKey(scope, 'forum', forumId, 'threads', boardId),
		queryFn: async ({ signal }) => reconcileThreads(scope, forumId, boardId, await searchThreadCards(getInputPeerForForumId(forumId), boardId, 200, scope, signal)),
		staleTime: 60_000, gcTime: 300_000, retry: false,
	});
}

export function threadActivityQueryOptions(scope: AccountScope, forumId: number, threadId: string) {
	return queryOptions({
		queryKey: accountQueryKey(scope, 'forum', forumId, 'activity', threadId),
		queryFn: ({ signal }) => getLastPostForThread(getInputPeerForForumId(forumId), threadId, 30, scope, signal),
		staleTime: 300_000, gcTime: 600_000, retry: false,
	});
}

export async function loadMoreBoards(scope: AccountScope, forumId: number): Promise<void> {
	const options = boardsQueryOptions(scope, forumId);
	const current = queryClient.getQueryData(options.queryKey);
	if (!current?.nextOffsetId) return;
	const next = await queryClient.fetchQuery({
		queryKey: [...options.queryKey, 'continuation', current.nextOffsetId],
		queryFn: ({ signal }) => searchBoardCards(getInputPeerForForumId(forumId), 200, scope, signal, current.nextOffsetId!),
		staleTime: 60_000, gcTime: 300_000, retry: false,
	});
	assertAccountScope(scope);
	queryClient.setQueryData(options.queryKey, (latest) => reconcileBoards(scope, forumId, latest ? { ...next, items: mergeCards(latest.items, next.items) } : next, false));
}

export async function loadMoreThreads(scope: AccountScope, forumId: number, boardId: string): Promise<void> {
	const options = threadsQueryOptions(scope, forumId, boardId);
	const current = queryClient.getQueryData(options.queryKey);
	if (!current?.nextOffsetId) return;
	const next = await queryClient.fetchQuery({
		queryKey: [...options.queryKey, 'continuation', current.nextOffsetId],
		queryFn: ({ signal }) => searchThreadCards(getInputPeerForForumId(forumId), boardId, 200, scope, signal, current.nextOffsetId!),
		staleTime: 60_000, gcTime: 300_000, retry: false,
	});
	assertAccountScope(scope);
	queryClient.setQueryData(options.queryKey, (latest) => reconcileThreads(scope, forumId, boardId, latest ? { ...next, items: mergeCards(latest.items, next.items) } : next, false));
}

const reconciliation = new Map<string, ReturnType<typeof setTimeout>>();
onAccountDispose(() => {
	for (const timer of reconciliation.values()) clearTimeout(timer);
	reconciliation.clear();
	boardChanges.clear();
	threadChanges.clear();
	reservedChanges = 0;
});

/** Immediate active-query refresh plus one bounded indexing-lag reconciliation. */
export async function invalidateForumQueries(scope: AccountScope, forumId: number): Promise<void> {
	assertAccountScope(scope);
	const peer = peerCacheId(getInputPeerForForumId(forumId));
	await queryClient.invalidateQueries({ queryKey: accountQueryKey(scope, 'recent-history', peer), refetchType: 'none' });
	assertAccountScope(scope);
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: accountQueryKey(scope, 'forum-post-count', peer), refetchType: 'none' }),
		queryClient.invalidateQueries({ queryKey: accountQueryKey(scope, 'forum', forumId) }),
		queryClient.invalidateQueries({ queryKey: accountQueryKey(scope, 'posts', forumId) }),
	]);
	assertAccountScope(scope);
	const key = `${scope.accountId}:${scope.generation}:${forumId}`;
	const old = reconciliation.get(key);
	if (old) clearTimeout(old);
	reconciliation.set(key, setTimeout(() => {
		reconciliation.delete(key);
		if (scope.signal.aborted) return;
		void (async () => {
			await queryClient.invalidateQueries({ queryKey: accountQueryKey(scope, 'recent-history', peer), refetchType: 'none' });
			assertAccountScope(scope);
			await queryClient.invalidateQueries({ queryKey: accountQueryKey(scope, 'forum-post-count', peer), refetchType: 'none' });
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: accountQueryKey(scope, 'forum', forumId) }),
				queryClient.invalidateQueries({ queryKey: accountQueryKey(scope, 'posts', forumId) }),
			]);
		})().catch(() => { /* Query observers retain and display refresh errors. */ });
	}, 5_000));
}
