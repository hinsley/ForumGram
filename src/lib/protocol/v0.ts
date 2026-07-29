import { unescapePostContentFromForumGram } from './content';
import type { RawCardEnvelope } from './envelope';
import type { ParsedCard } from './types';
import { LEGACY_PROTOCOL_VERSION } from './types';

function valueOrEmptyString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

export function decodeVersion0Card(envelope: RawCardEnvelope): ParsedCard | null {
	if (envelope.version !== LEGACY_PROTOCOL_VERSION) return null;

	switch (envelope.kind) {
		case 'board':
			return {
				kind: 'board',
				version: LEGACY_PROTOCOL_VERSION,
				id: envelope.id,
				data: {
					title: valueOrEmptyString(envelope.payload.title),
					description: valueOrEmptyString(envelope.payload.description),
				},
			};
		case 'thread':
			return {
				kind: 'thread',
				version: LEGACY_PROTOCOL_VERSION,
				id: envelope.id,
				parentBoardId: envelope.parentId!,
				data: { title: valueOrEmptyString(envelope.payload.title) },
			};
		case 'post':
			return {
				kind: 'post',
				version: LEGACY_PROTOCOL_VERSION,
				id: envelope.id,
				parentThreadId: envelope.parentId!,
				data: {
					content: unescapePostContentFromForumGram(valueOrEmptyString(envelope.payload.content)),
				},
			};
	}
}
