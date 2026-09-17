import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { queryClient } from '@lib/queryClient';
import { canonicalPage, composeBoardCard, composePostCard, composeThreadCard, fetchPostPage, searchBoardCards, searchThreadCards, searchResponseCount } from './protocol';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@lib/telegram/client', () => ({ getClient: async () => ({ invoke }) }));
vi.mock('@lib/accountScope', () => ({
	assertAccountScope: (scope: { signal: AbortSignal }) => { if (scope.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); },
	captureAccountScope: () => { throw new Error('Explicit test scope required'); },
	accountQueryKey: (scope: { generation: number }, ...parts: unknown[]) => ['test', scope.generation, ...parts],
	onAccountDispose: () => () => {},
}));
const input = new Api.InputPeerChat({ chatId: bigInt(1) });
let generation = 0;
function makeScope() { return { accountId: 'test', generation: ++generation, signal: new AbortController().signal }; }
function message(id: number, text: string, date = 100) {
	return new Api.Message({ id, message: text, date, peerId: new Api.PeerChat({ chatId: bigInt(1) }) });
}
function slice(messages: Api.TypeMessage[], count: number) {
	return new Api.messages.MessagesSlice({ messages, count, chats: [], users: [] });
}
afterEach(() => { invoke.mockReset(); queryClient.clear(); });

it('does not reinterpret a bare Messages window as the thread total', async () => {
	invoke.mockResolvedValueOnce(slice([], 21)).mockResolvedValueOnce(new Api.messages.Messages({
		messages: [message(11, composePostCard('p11', 'thread', { content: 'post' }))], chats: [], users: [],
	}));
	const result = await fetchPostPage(input, 'thread', 2, 10, makeScope());
	expect(result).toMatchObject({ count: 21, page: 2, pages: 3 });
	expect(invoke).toHaveBeenCalledTimes(2);
});

it('stops the shared recent-history tail before its second RPC when its initiating consumer cancels', async () => {
	const scope = makeScope();
	const consumer = new AbortController();
	let historyCalls = 0;
	invoke.mockImplementation(async (request: Api.messages.Search | Api.messages.GetHistory) => {
		if (request instanceof Api.messages.Search) return slice([], 0);
		historyCalls++;
		consumer.abort();
		return slice(Array.from({ length: 100 }, (_, index) => new Api.MessageEmpty({ id: 500 - index })), 200);
	});
	await expect(searchBoardCards(input, 200, scope, consumer.signal)).rejects.toMatchObject({ name: 'AbortError' });
	expect(historyCalls).toBe(1);
});

describe('protocol discovery and live pages', () => {
	it('advances raw service-message pages and reconciles duplicate cards from one shared peer tail', async () => {
		const scope = makeScope();
		const services = Array.from({ length: 100 }, (_, index) => new Api.MessageEmpty({ id: 500 - index }));
		const searchOffsets: number[] = [];
		let historyCalls = 0;
		invoke.mockImplementation(async (request: Api.messages.Search | Api.messages.GetHistory) => {
			if (request instanceof Api.messages.GetHistory) {
				historyCalls++;
				return slice([message(900, composeBoardCard('board', { title: 'Latest' })), message(899, composeThreadCard('thread', 'board', { title: 'Thread' }))], 2);
			}
			if (request.q.includes('thread')) return slice([message(88, composeThreadCard('wrong', 'other', { title: 'Wrong parent' }))], 1);
			searchOffsets.push(request.offsetId ?? 0);
			return request.offsetId ? slice([message(300, composeBoardCard('board', { title: 'Old' }))], 1) : slice(services, 101);
		});
		const boards = await searchBoardCards(input, 200, scope);
		const threads = await searchThreadCards(input, 'board', 200, scope);
		expect(searchOffsets).toEqual([0, 401]);
		expect(boards.items.map((board) => [board.id, board.title])).toEqual([['board', 'Latest']]);
		expect(boards.complete).toBe(true);
		expect(threads.items.map((thread) => thread.id)).toEqual(['thread']);
		expect(historyCalls).toBe(1);
	});

	it('exposes continuation when a bounded metadata window is full', async () => {
		invoke.mockImplementation(async (request: Api.messages.Search | Api.messages.GetHistory) => request instanceof Api.messages.GetHistory ? slice([], 0) : slice(Array.from({ length: 100 }, (_, index) => message(200 - index, composeBoardCard(`b${index}`, { title: 'Board' }))), 500));
		const result = await searchBoardCards(input, 100, makeScope());
		expect(result.complete).toBe(false);
		expect(result.nextOffsetId).toBe(101);
	});

	it('canonicalizes a final live window and filters false matches with deterministic same-second ordering', async () => {
		invoke.mockResolvedValueOnce(slice([], 11)).mockResolvedValueOnce(slice([
			message(11, composePostCard('newer', 'thread', { content: 'newer' })),
			message(10, composePostCard('older', 'thread', { content: 'older' })),
			message(9, composePostCard('other', 'not-thread', { content: 'other' })),
		], 11));
		const result = await fetchPostPage(input, 'thread', 999, 10, makeScope());
		expect(result.page).toBe(2);
		expect(result.count).toBe(11);
		expect(result.countIsExact).toBe(false);
		expect(result.items.map((post) => post.messageId)).toEqual([10, 11]);
	});

	it('uses the unsliced response count and never turns count RPC failure into empty success', async () => {
		const response = new Api.messages.Messages({ messages: [message(1, 'hit'), message(2, 'hit')], chats: [], users: [] });
		expect(searchResponseCount(response)).toBe(2);
		invoke.mockRejectedValueOnce(new Error('CHAT_ADMIN_REQUIRED'));
		await expect(fetchPostPage(input, 'thread', 1, 10, makeScope())).rejects.toThrow('CHAT_ADMIN_REQUIRED');
		expect(invoke).toHaveBeenCalledTimes(1);
	});

	it('does not request a page when the confirmed raw count is zero', async () => {
		invoke.mockResolvedValueOnce(slice([], 0));
		expect(await fetchPostPage(input, 'thread', 1, 10, makeScope())).toMatchObject({ items: [], count: 0, page: 1 });
		expect(invoke).toHaveBeenCalledTimes(1);
	});

	it('stops metadata pagination after cancellation', async () => {
		const controller = new AbortController();
		const scope = { ...makeScope(), signal: controller.signal };
		invoke.mockImplementationOnce(async () => {
			controller.abort();
			return slice(Array.from({ length: 100 }, (_, index) => new Api.MessageEmpty({ id: 500 - index })), 200);
		});
		await expect(searchBoardCards(input, 200, scope)).rejects.toMatchObject({ name: 'AbortError' });
		expect(invoke).toHaveBeenCalledTimes(1);
	});

	it('normalizes non-integer and unsafe page identities', () => {
		expect([0, -2, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(canonicalPage)).toEqual([1, 1, 1, 1, 1, 1]);
		expect(canonicalPage(12)).toBe(12);
	});
});
