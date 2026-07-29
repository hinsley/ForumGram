import { parseRawCardEnvelope } from './envelope';
import type {
	BoardCardData,
	ParsedBoardCard,
	ParsedCard,
	ParsedPostCard,
	ParsedThreadCard,
	PostCardData,
	ProtocolVersion,
	ThreadCardData,
} from './types';
import { CURRENT_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION } from './types';
import { decodeVersion0Card } from './v0';
import {
	composeBoardCardV1,
	composePostCardV1,
	composeThreadCardV1,
	decodeVersion1Card,
} from './v1';

export function generateIdHash(length: number = 16): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function composeBoardCard(id: string, data: BoardCardData): string {
	return composeBoardCardV1(id, data);
}

export function composeThreadCard(id: string, parentBoardId: string, data: ThreadCardData): string {
	return composeThreadCardV1(id, parentBoardId, data);
}

export function composePostCard(id: string, parentThreadId: string, data: PostCardData): string {
	return composePostCardV1(id, parentThreadId, data);
}

export function parseCard(text: string): ParsedCard | null {
	const envelope = parseRawCardEnvelope(text);
	if (!envelope) return null;
	if (envelope.version === LEGACY_PROTOCOL_VERSION) return decodeVersion0Card(envelope);
	if (envelope.version === CURRENT_PROTOCOL_VERSION) return decodeVersion1Card(envelope);
	return null;
}

export function parseBoardCard(text: string): ParsedBoardCard | null {
	const parsed = parseCard(text);
	return parsed?.kind === 'board' ? parsed : null;
}

export function parseThreadCard(text: string): ParsedThreadCard | null {
	const parsed = parseCard(text);
	return parsed?.kind === 'thread' ? parsed : null;
}

export function parsePostCard(text: string): ParsedPostCard | null {
	const parsed = parseCard(text);
	return parsed?.kind === 'post' ? parsed : null;
}

export function getCardProtocolVersion(text: string): ProtocolVersion | null {
	return parseCard(text)?.version ?? null;
}

/** Return a version 1 representation without writing it back to Telegram. */
export function upgradeCardToCurrent(text: string): string | null {
	const parsed = parseCard(text);
	if (!parsed) return null;
	if (parsed.version === CURRENT_PROTOCOL_VERSION) return text;

	switch (parsed.kind) {
		case 'board':
			return composeBoardCard(parsed.id, parsed.data);
		case 'thread':
			return composeThreadCard(parsed.id, parsed.parentBoardId, parsed.data);
		case 'post':
			return composePostCard(parsed.id, parsed.parentThreadId, parsed.data);
	}
}
