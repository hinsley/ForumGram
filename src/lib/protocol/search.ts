import { Api } from 'telegram';
import { getClient } from '@lib/telegram/client';
import { parseBoardCard, parsePostCard, parseThreadCard } from './codec';
import type { BoardMeta, PostCard, ThreadMeta } from './types';

function isTelegramMessage(message: any): boolean {
	return message?.className === 'Message' || message?._ === 'message';
}

export function boardMetaFromTelegramMessage(message: any): BoardMeta | null {
	if (!isTelegramMessage(message)) return null;
	const parsed = parseBoardCard(message.message ?? '');
	if (!parsed) return null;
	return {
		version: parsed.version,
		id: parsed.id,
		messageId: Number(message.id),
		creatorUserId: message.fromId?.userId ? Number(message.fromId.userId) : undefined,
		date: Number(message.date),
		title: parsed.data.title,
		description: parsed.data.description,
	};
}

export function threadMetaFromTelegramMessage(message: any): ThreadMeta | null {
	if (!isTelegramMessage(message)) return null;
	const parsed = parseThreadCard(message.message ?? '');
	if (!parsed) return null;
	return {
		version: parsed.version,
		id: parsed.id,
		parentBoardId: parsed.parentBoardId,
		messageId: Number(message.id),
		creatorUserId: message.fromId?.userId ? Number(message.fromId.userId) : undefined,
		date: Number(message.date),
		title: parsed.data.title,
	};
}

export function postCardFromTelegramMessage(
	message: any,
	usersMap: Record<string, any> = {},
): PostCard | null {
	if (!isTelegramMessage(message)) return null;
	const parsed = parsePostCard(message.message ?? '');
	if (!parsed) return null;
	const fromUserId: number | undefined = message.fromId?.userId ? Number(message.fromId.userId) : undefined;
	return {
		version: parsed.version,
		id: parsed.id,
		parentThreadId: parsed.parentThreadId,
		messageId: Number(message.id),
		fromUserId,
		user: fromUserId ? usersMap[String(fromUserId)] : undefined,
		date: Number(message.date),
		content: parsed.data.content,
		media: message.media,
		groupedId: message.groupedId ? String(message.groupedId) : undefined,
	};
}

export async function searchBoardCards(input: Api.TypeInputPeer, queryLimit = 100): Promise<BoardMeta[]> {
	const client = await getClient();
	const res: any = await client.invoke(new Api.messages.Search({
		peer: input,
		q: 'fg.metadata.board',
		limit: queryLimit,
		filter: new Api.InputMessagesFilterEmpty(),
	}));
	const items: BoardMeta[] = [];
	const seenMsgIds = new Set<number>();
	for (const message of (res.messages ?? [])) {
		const item = boardMetaFromTelegramMessage(message);
		if (!item) continue;
		seenMsgIds.add(item.messageId);
		items.push(item);
	}

	if (items.length < queryLimit) {
		let offsetId = 0;
		const pageSize = Math.min(100, queryLimit);
		let pages = 0;
		while (items.length < queryLimit && pages < 30) {
			const page: any = await client.invoke(new Api.messages.GetHistory({
				peer: input,
				offsetId,
				addOffset: 0,
				limit: pageSize,
			}));
			const batch: any[] = (page.messages ?? []).filter(isTelegramMessage);
			if (!batch.length) break;
			for (const message of batch) {
				const messageId = Number(message.id);
				if (seenMsgIds.has(messageId)) continue;
				const item = boardMetaFromTelegramMessage(message);
				if (!item) continue;
				seenMsgIds.add(messageId);
				items.push(item);
				if (items.length >= queryLimit) break;
			}
			offsetId = Number(batch[batch.length - 1].id);
			pages++;
		}
	}
	return items;
}

export async function searchThreadCards(
	input: Api.TypeInputPeer,
	parentBoardId: string,
	queryLimit = 200,
): Promise<ThreadMeta[]> {
	const client = await getClient();
	const q = `fg.metadata.thread ${parentBoardId}`;
	const res: any = await client.invoke(new Api.messages.Search({
		peer: input,
		q,
		limit: queryLimit,
		filter: new Api.InputMessagesFilterEmpty(),
	}));
	const items: ThreadMeta[] = [];
	const seenMsgIds = new Set<number>();
	for (const message of (res.messages ?? [])) {
		const item = threadMetaFromTelegramMessage(message);
		if (!item || item.parentBoardId !== parentBoardId) continue;
		seenMsgIds.add(item.messageId);
		items.push(item);
	}

	if (items.length < queryLimit) {
		let offsetId = 0;
		const pageSize = Math.min(100, queryLimit);
		let pages = 0;
		while (items.length < queryLimit && pages < 30) {
			const page: any = await client.invoke(new Api.messages.GetHistory({
				peer: input,
				offsetId,
				addOffset: 0,
				limit: pageSize,
			}));
			const batch: any[] = (page.messages ?? []).filter(isTelegramMessage);
			if (!batch.length) break;
			for (const message of batch) {
				const messageId = Number(message.id);
				if (seenMsgIds.has(messageId)) continue;
				const item = threadMetaFromTelegramMessage(message);
				if (!item || item.parentBoardId !== parentBoardId) continue;
				seenMsgIds.add(messageId);
				items.push(item);
				if (items.length >= queryLimit) break;
			}
			offsetId = Number(batch[batch.length - 1].id);
			pages++;
		}
	}
	return items;
}

export async function searchPostCards(
	input: Api.TypeInputPeer,
	parentThreadId: string,
	queryLimit = 500,
): Promise<PostCard[]> {
	const client = await getClient();
	const q = `fg.post ${parentThreadId}`;
	const res: any = await client.invoke(new Api.messages.Search({
		peer: input,
		q,
		limit: queryLimit,
		filter: new Api.InputMessagesFilterEmpty(),
	}));
	const usersMap: Record<string, any> = {};
	(res.users ?? []).forEach((user: any) => { usersMap[String(user.id)] = user; });
	const items: PostCard[] = [];
	for (const message of (res.messages ?? [])) {
		const item = postCardFromTelegramMessage(message, usersMap);
		if (!item || item.parentThreadId !== parentThreadId) continue;
		items.push(item);
	}
	return items;
}

export async function getLastPostForThread(
	input: Api.TypeInputPeer,
	parentThreadId: string,
	queryLimit: number = 100,
): Promise<PostCard | null> {
	const items = await searchPostCards(input, parentThreadId, queryLimit);
	let latest: PostCard | null = null;
	for (const post of items) {
		if (!latest || (post.date ?? 0) > (latest.date ?? 0)) latest = post;
	}
	return latest;
}

export async function getLastPostForBoard(
	input: Api.TypeInputPeer,
	parentBoardId: string,
	perThreadPostQueryLimit: number = 50,
	maxThreadsToScan: number = 30,
): Promise<PostCard | null> {
	const threads = await searchThreadCards(input, parentBoardId, 500);
	const sorted = [...threads]
		.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
		.slice(0, Math.max(1, maxThreadsToScan));
	const results = await Promise.all(
		sorted.map((thread) => getLastPostForThread(input, thread.id, perThreadPostQueryLimit)),
	);
	let latest: PostCard | null = null;
	for (const post of results) {
		if (post && (!latest || (post.date ?? 0) > (latest.date ?? 0))) latest = post;
	}
	return latest;
}
