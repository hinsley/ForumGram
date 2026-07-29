import type { CardKind, ProtocolVersion } from './types';
import { CURRENT_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION } from './types';

export const BOARD_CARD_HEADER = 'fg.metadata.board';
export const THREAD_CARD_HEADER = 'fg.metadata.thread';
export const POST_CARD_HEADER = 'fg.post';

export type RawCardEnvelope = {
	kind: CardKind;
	id: string;
	parentId?: string;
	payload: Record<string, unknown>;
	version: ProtocolVersion;
};

function readPayload(lines: string[], startIndex: number): Record<string, unknown> | null {
	try {
		const payload: unknown = JSON.parse(lines.slice(startIndex).join('\n'));
		return payload && typeof payload === 'object' && !Array.isArray(payload)
			? payload as Record<string, unknown>
			: null;
	} catch {
		return null;
	}
}

function readVersion(payload: Record<string, unknown>): ProtocolVersion | null {
	if (!Object.prototype.hasOwnProperty.call(payload, 'version')) return LEGACY_PROTOCOL_VERSION;
	return payload.version === CURRENT_PROTOCOL_VERSION ? CURRENT_PROTOCOL_VERSION : null;
}

export function parseRawCardEnvelope(text: string): RawCardEnvelope | null {
	const lines = (text ?? '').split(/\n/);
	const header = lines[0];
	const id = lines[1]?.trim();
	if (!id) return null;

	let kind: CardKind;
	let payloadStart: number;
	let parentId: string | undefined;

	if (header === BOARD_CARD_HEADER) {
		kind = 'board';
		payloadStart = 2;
		if (lines.length < 3) return null;
	} else if (header === THREAD_CARD_HEADER || header === POST_CARD_HEADER) {
		kind = header === THREAD_CARD_HEADER ? 'thread' : 'post';
		payloadStart = 3;
		if (lines.length < 4) return null;
		const parentLine = lines[2] ?? '';
		if (!parentLine.startsWith('parent:')) return null;
		parentId = parentLine.slice('parent:'.length).trim();
		if (!parentId) return null;
	} else {
		return null;
	}

	const payload = readPayload(lines, payloadStart);
	if (!payload) return null;
	const version = readVersion(payload);
	if (version === null) return null;
	return { kind, id, parentId, payload, version };
}
