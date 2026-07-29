import { escapePostContentForForumGram, unescapePostContentFromForumGram } from './content';
import { BOARD_CARD_HEADER, POST_CARD_HEADER, THREAD_CARD_HEADER } from './envelope';
import type { RawCardEnvelope } from './envelope';
import type { BoardCardData, ParsedCard, PostCardData, ThreadCardData } from './types';
import { CURRENT_PROTOCOL_VERSION } from './types';

function valueOrEmptyString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

export function composeBoardCardV1(id: string, data: BoardCardData): string {
	const payload = JSON.stringify({
		version: CURRENT_PROTOCOL_VERSION,
		title: data.title,
		description: data.description ?? '',
	});
	return `${BOARD_CARD_HEADER}\n${id}\n${payload}`;
}

export function composeThreadCardV1(id: string, parentBoardId: string, data: ThreadCardData): string {
	const payload = JSON.stringify({ version: CURRENT_PROTOCOL_VERSION, title: data.title });
	return `${THREAD_CARD_HEADER}\n${id}\nparent:${parentBoardId}\n${payload}`;
}

export function composePostCardV1(id: string, parentThreadId: string, data: PostCardData): string {
	const payload = JSON.stringify({
		version: CURRENT_PROTOCOL_VERSION,
		content: escapePostContentForForumGram(data.content),
	});
	return `${POST_CARD_HEADER}\n${id}\nparent:${parentThreadId}\n${payload}`;
}

export function decodeVersion1Card(envelope: RawCardEnvelope): ParsedCard | null {
	if (envelope.version !== CURRENT_PROTOCOL_VERSION) return null;

	switch (envelope.kind) {
		case 'board':
			return {
				kind: 'board',
				version: CURRENT_PROTOCOL_VERSION,
				id: envelope.id,
				data: {
					title: valueOrEmptyString(envelope.payload.title),
					description: valueOrEmptyString(envelope.payload.description),
				},
			};
		case 'thread':
			return {
				kind: 'thread',
				version: CURRENT_PROTOCOL_VERSION,
				id: envelope.id,
				parentBoardId: envelope.parentId!,
				data: { title: valueOrEmptyString(envelope.payload.title) },
			};
		case 'post':
			return {
				kind: 'post',
				version: CURRENT_PROTOCOL_VERSION,
				id: envelope.id,
				parentThreadId: envelope.parentId!,
				data: {
					content: unescapePostContentFromForumGram(valueOrEmptyString(envelope.payload.content)),
				},
			};
	}
}
