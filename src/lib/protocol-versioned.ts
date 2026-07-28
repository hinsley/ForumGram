import * as legacy from './protocol';

export * from './protocol-pagination';

export const LEGACY_PROTOCOL_VERSION = 0 as const;
export const CURRENT_PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof LEGACY_PROTOCOL_VERSION | typeof CURRENT_PROTOCOL_VERSION;

export interface ParsedBoardCard {
	version: ProtocolVersion;
	id: string;
	data: { title: string; description?: string };
}

export interface ParsedThreadCard {
	version: ProtocolVersion;
	id: string;
	parentBoardId: string;
	data: { title: string };
}

export interface ParsedPostCard {
	version: ProtocolVersion;
	id: string;
	parentThreadId: string;
	data: { content: string };
}

function addCurrentVersion(card: string, payloadLineIndex: number): string {
	const lines = card.split(/\n/);
	const payload = JSON.parse(lines.slice(payloadLineIndex).join('\n')) as Record<string, unknown>;
	return [
		...lines.slice(0, payloadLineIndex),
		JSON.stringify({ version: CURRENT_PROTOCOL_VERSION, ...payload }),
	].join('\n');
}

function readProtocolVersion(text: string, payloadLineIndex: number): ProtocolVersion | null {
	const lines = (text ?? '').split(/\n/);
	try {
		const payload: unknown = JSON.parse(lines.slice(payloadLineIndex).join('\n'));
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
		if (!Object.prototype.hasOwnProperty.call(payload, 'version')) return LEGACY_PROTOCOL_VERSION;
		return (payload as { version?: unknown }).version === CURRENT_PROTOCOL_VERSION
			? CURRENT_PROTOCOL_VERSION
			: null;
	} catch {
		return null;
	}
}

export function composeBoardCard(id: string, data: { title: string; description?: string }): string {
	return addCurrentVersion(legacy.composeBoardCard(id, data), 2);
}

export function parseBoardCard(text: string): ParsedBoardCard | null {
	const version = readProtocolVersion(text, 2);
	if (version === null) return null;
	const parsed = legacy.parseBoardCard(text);
	return parsed ? { version, ...parsed } : null;
}

export function composeThreadCard(id: string, parentBoardId: string, data: { title: string }): string {
	return addCurrentVersion(legacy.composeThreadCard(id, parentBoardId, data), 3);
}

export function parseThreadCard(text: string): ParsedThreadCard | null {
	const version = readProtocolVersion(text, 3);
	if (version === null) return null;
	const parsed = legacy.parseThreadCard(text);
	return parsed ? { version, ...parsed } : null;
}

export function composePostCard(id: string, parentThreadId: string, data: { content: string }): string {
	return addCurrentVersion(legacy.composePostCard(id, parentThreadId, data), 3);
}

export function parsePostCard(text: string): ParsedPostCard | null {
	const version = readProtocolVersion(text, 3);
	if (version === null) return null;
	const parsed = legacy.parsePostCard(text);
	return parsed ? { version, ...parsed } : null;
}
