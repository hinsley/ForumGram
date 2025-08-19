import { TelegramClient } from 'telegram';
import { Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { TG_API_HASH, TG_API_ID } from './constants';
import { getStoredSessionString } from '@state/session';
import { computeCheck } from 'telegram/Password';

let cachedClient: TelegramClient | null = null;
let connecting: Promise<TelegramClient> | null = null;

async function createClient(sessionStr: string | null): Promise<TelegramClient> {
	const session = new StringSession(sessionStr ?? '');
	const client = new TelegramClient(session, TG_API_ID, TG_API_HASH, { connectionRetries: 5 });
	await client.connect();
	return client;
}

export async function getClient(): Promise<TelegramClient> {
	if (cachedClient) return cachedClient;
	if (connecting) return connecting;
	const session = getStoredSessionString();
	connecting = createClient(session)
		.then((c) => {
			cachedClient = c;
			connecting = null;
			return c;
		})
		.catch((e) => {
			connecting = null;
			throw e;
		});
	return connecting;
}

export async function sendCode(phone: string): Promise<{ phoneCodeHash: string }>
{
	const client = await getClient();
	const res: any = await client.invoke(new Api.auth.SendCode({
		phoneNumber: phone,
		apiId: TG_API_ID,
		apiHash: TG_API_HASH,
		settings: new Api.CodeSettings({})
	}));
	const phoneCodeHash = (res as any).phoneCodeHash ?? (res as any).phone_code_hash ?? '';
	return { phoneCodeHash };
}

export async function signIn(phone: string, code: string, phoneCodeHash: string, password?: string) {
	const client = await getClient();
	try {
		const signed = await client.invoke(new Api.auth.SignIn({
			phoneNumber: phone,
			phoneCode: code,
			phoneCodeHash,
		}));
		return signed;
	} catch (e: any) {
		if (e.errorMessage === 'SESSION_PASSWORD_NEEDED' && password) {
			const pwd = await client.invoke(new Api.account.GetPassword());
			const passwordSrp = await computeCheck(pwd as any, password);
			const auth = await client.invoke(new Api.auth.CheckPassword({ password: passwordSrp }));
			return auth;
		}
		throw e;
	}
}

export async function logOut() {
	const client = await getClient();
	try { await client.invoke(new Api.auth.LogOut()); } catch {}
	try { await client.disconnect(); } catch {}
	cachedClient = null;
}

export async function getMe() {
	const client = await getClient();
	const me = await client.getMe();
	return me as any;
}

export async function resolveForum(handleOrInvite: string) {
	const client = await getClient();
	if (handleOrInvite.startsWith('@')) {
		const username = handleOrInvite.slice(1);
		const res = await client.invoke(new Api.contacts.ResolveUsername({ username }));
		return res;
	}
	if (handleOrInvite.includes('t.me') || handleOrInvite.includes('telegram.me')) {
		const path = handleOrInvite.split('/').pop() ?? '';
		if (path.startsWith('+')) {
			const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: path.slice(1) }));
			return invite;
		}
		const username = path;
		const res = await client.invoke(new Api.contacts.ResolveUsername({ username }));
		return res;
	}
	throw new Error('Unsupported forum identifier');
}

export async function getForumTopics(input: Api.TypeInputPeer, offsetDate = 0, offsetId = 0, limit = 50) {
	const client = await getClient();
	const res = await client.invoke(new Api.channels.GetForumTopics({
		channel: input,
		offsetDate,
		offsetId,
		limit,
	}));
	return res;
}

export async function getTopicHistory(input: Api.TypeInputPeer, topicId: number, addOffset = 0, limit = 50) {
	const client = await getClient();
	const res = await client.invoke(new Api.messages.GetHistory({
		peer: input,
		addOffset,
		limit,
		// @ts-expect-error top_msg_id works for forum topics in GramJS
		topMsgId: topicId,
	}));
	return res;
}

export async function sendMessageToTopic(input: Api.TypeInputPeer, topicId: number, message: string, entities?: any[]) {
	const client = await getClient();
	const res = await client.sendMessage(input as any, ({
		message,
		entities,
		replyTo: topicId,
		topMsgId: topicId,
	} as any));
	return res;
}

// Generic helpers for non-topic group chats
export async function sendPlainMessage(input: Api.TypeInputPeer, message: string, entities?: any[]) {
	const client = await getClient();
	const res = await client.sendMessage(input as any, ({ message, entities } as any));
	return res;
}

export async function deleteMessages(input: Api.TypeInputPeer, messageIds: number[]) {
	const client = await getClient();
	await (client as any).deleteMessages(input as any, messageIds, { revoke: true });
}

export async function editMessage(input: Api.TypeInputPeer, messageId: number, message: string, entities?: any[]) {
	const client = await getClient();
	const res = await client.invoke(new Api.messages.EditMessage({ peer: input, id: messageId, message, entities } as any));
	return res;
}