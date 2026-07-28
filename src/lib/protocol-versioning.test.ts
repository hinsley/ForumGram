import { describe, expect, it } from 'vitest';
import { parsePostCard as parseLegacyPostCard } from './protocol';
import {
	CURRENT_PROTOCOL_VERSION,
	LEGACY_PROTOCOL_VERSION,
	composeBoardCard,
	composePostCard,
	composeThreadCard,
	parseBoardCard,
	parsePostCard,
	parseThreadCard,
} from './protocol-versioned';

describe('ForumGram card protocol versioning', () => {
	it('writes version 1 into every new card payload', () => {
		const boardPayload = JSON.parse(composeBoardCard('board-id', { title: 'Board' }).split('\n').slice(2).join('\n'));
		const threadPayload = JSON.parse(composeThreadCard('thread-id', 'board-id', { title: 'Thread' }).split('\n').slice(3).join('\n'));
		const postPayload = JSON.parse(composePostCard('post-id', 'thread-id', { content: 'Post' }).split('\n').slice(3).join('\n'));

		expect(boardPayload.version).toBe(CURRENT_PROTOCOL_VERSION);
		expect(threadPayload.version).toBe(CURRENT_PROTOCOL_VERSION);
		expect(postPayload.version).toBe(CURRENT_PROTOCOL_VERSION);
	});

	it('reports new cards as version 1', () => {
		expect(parseBoardCard(composeBoardCard('board-id', { title: 'Board' }))?.version).toBe(CURRENT_PROTOCOL_VERSION);
		expect(parseThreadCard(composeThreadCard('thread-id', 'board-id', { title: 'Thread' }))?.version).toBe(CURRENT_PROTOCOL_VERSION);
		expect(parsePostCard(composePostCard('post-id', 'thread-id', { content: 'Post' }))?.version).toBe(CURRENT_PROTOCOL_VERSION);
	});

	it('continues to read unlabeled cards as version 0', () => {
		const boardV0 = 'fg.metadata.board\nboard-id\n{"title":"Board","description":""}';
		const threadV0 = 'fg.metadata.thread\nthread-id\nparent:board-id\n{"title":"Thread"}';
		const postV0 = 'fg.post\npost-id\nparent:thread-id\n{"content":"Post"}';

		expect(parseBoardCard(boardV0)?.version).toBe(LEGACY_PROTOCOL_VERSION);
		expect(parseThreadCard(threadV0)?.version).toBe(LEGACY_PROTOCOL_VERSION);
		expect(parsePostCard(postV0)?.version).toBe(LEGACY_PROTOCOL_VERSION);
	});

	it('keeps version 1 post payloads readable by the version 0 parser', () => {
		const card = composePostCard('post-id', 'thread-id', { content: '```ts\nconst x = 1;\n```' });
		expect(parseLegacyPostCard(card)?.data.content).toBe('```ts\nconst x = 1;\n```');
	});

	it('rejects explicitly unsupported protocol versions', () => {
		const unsupported = 'fg.post\npost-id\nparent:thread-id\n{"version":2,"content":"Post"}';
		expect(parsePostCard(unsupported)).toBeNull();
	});
});
