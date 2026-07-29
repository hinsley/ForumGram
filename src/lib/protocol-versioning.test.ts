import { describe, expect, it } from 'vitest';
import {
	CURRENT_PROTOCOL_VERSION,
	LEGACY_PROTOCOL_VERSION,
	boardMetaFromTelegramMessage,
	composeBoardCard,
	composePostCard,
	composeThreadCard,
	parseBoardCard,
	parseCard,
	parsePostCard,
	parseThreadCard,
	postCardFromTelegramMessage,
	threadMetaFromTelegramMessage,
} from './protocol';
import { GOLDEN_CARDS } from './protocol/golden-fixtures';

function telegramMessage(message: string, id: number = 1): any {
	return { className: 'Message', id, date: 1, message, fromId: { userId: 7 } };
}

describe('ForumGram card protocol dispatcher', () => {
	it('emits the fixed version 1 wire format', () => {
		expect(composeBoardCard('board-id', { title: 'Board', description: 'Description' }))
			.toBe(GOLDEN_CARDS.v1.board);
		expect(composeThreadCard('thread-id', 'board-id', { title: 'Thread' }))
			.toBe(GOLDEN_CARDS.v1.thread);
		expect(composePostCard('post-id', 'thread-id', { content: 'Post' }))
			.toBe(GOLDEN_CARDS.v1.post);
	});

	it('dispatches version 0 and version 1 cards to normalized results', () => {
		expect(parseBoardCard(GOLDEN_CARDS.v0.board)).toMatchObject({
			kind: 'board', version: LEGACY_PROTOCOL_VERSION, id: 'board-id',
		});
		expect(parseThreadCard(GOLDEN_CARDS.v0.thread)).toMatchObject({
			kind: 'thread', version: LEGACY_PROTOCOL_VERSION, parentBoardId: 'board-id',
		});
		expect(parsePostCard(GOLDEN_CARDS.v0.post)).toMatchObject({
			kind: 'post', version: LEGACY_PROTOCOL_VERSION, parentThreadId: 'thread-id',
		});
		expect(parseCard(GOLDEN_CARDS.v1.board)?.version).toBe(CURRENT_PROTOCOL_VERSION);
		expect(parseCard(GOLDEN_CARDS.v1.thread)?.version).toBe(CURRENT_PROTOCOL_VERSION);
		expect(parseCard(GOLDEN_CARDS.v1.post)?.version).toBe(CURRENT_PROTOCOL_VERSION);
	});

	it('rejects unsupported explicit versions through every card parser', () => {
		expect(parseBoardCard(GOLDEN_CARDS.unsupported.board)).toBeNull();
		expect(parseThreadCard(GOLDEN_CARDS.unsupported.thread)).toBeNull();
		expect(parsePostCard(GOLDEN_CARDS.unsupported.post)).toBeNull();
		expect(parseCard(GOLDEN_CARDS.unsupported.post)).toBeNull();
	});

	it('rejects unsupported versions in Telegram search and pagination conversion paths', () => {
		expect(boardMetaFromTelegramMessage(telegramMessage(GOLDEN_CARDS.unsupported.board))).toBeNull();
		expect(threadMetaFromTelegramMessage(telegramMessage(GOLDEN_CARDS.unsupported.thread))).toBeNull();
		expect(postCardFromTelegramMessage(telegramMessage(GOLDEN_CARDS.unsupported.post))).toBeNull();
	});
});
