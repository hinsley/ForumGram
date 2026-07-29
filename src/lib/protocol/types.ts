export const LEGACY_PROTOCOL_VERSION = 0 as const;
export const CURRENT_PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof LEGACY_PROTOCOL_VERSION | typeof CURRENT_PROTOCOL_VERSION;
export type CardKind = 'board' | 'thread' | 'post';

export type BoardCardData = { title: string; description?: string };
export type ThreadCardData = { title: string };
export type PostCardData = { content: string };

export interface ParsedBoardCard {
	kind: 'board';
	version: ProtocolVersion;
	id: string;
	data: BoardCardData;
}

export interface ParsedThreadCard {
	kind: 'thread';
	version: ProtocolVersion;
	id: string;
	parentBoardId: string;
	data: ThreadCardData;
}

export interface ParsedPostCard {
	kind: 'post';
	version: ProtocolVersion;
	id: string;
	parentThreadId: string;
	data: PostCardData;
}

export type ParsedCard = ParsedBoardCard | ParsedThreadCard | ParsedPostCard;

export interface BoardMeta {
	version: ProtocolVersion;
	id: string;
	messageId: number;
	creatorUserId?: number;
	date?: number;
	title: string;
	description?: string;
}

export interface ThreadMeta {
	version: ProtocolVersion;
	id: string;
	parentBoardId: string;
	messageId: number;
	creatorUserId?: number;
	date?: number;
	title: string;
}

export interface PostCard {
	version: ProtocolVersion;
	id: string;
	parentThreadId: string;
	messageId: number;
	fromUserId?: number;
	user?: any;
	date?: number;
	content: string;
	media?: any;
	groupedId?: string;
}
