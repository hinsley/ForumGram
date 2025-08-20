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
			try {
				const imported = await client.invoke(new Api.messages.ImportChatInvite({ hash: path.slice(1) }));
				return imported;
			} catch (e: any) {
				const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: path.slice(1) }));
				return invite;
			}
		}
		const username = path;
		const res = await client.invoke(new Api.contacts.ResolveUsername({ username }));
		return res;
	}
	throw new Error('Unsupported forum identifier');
}

// Deprecated topic-specific helpers removed (ForumGram does not use Telegram Topics)

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

export async function sendMediaMessage(
	input: Api.TypeInputPeer,
	message: string,
	media: Api.TypeInputMedia,
	entities?: any[],
) {
	const client = await getClient();
	const res = await client.invoke(new Api.messages.SendMedia({
		peer: input,
		media,
		message,
		entities,
	} as any));
	return res as any;
}

export async function sendMultiMediaMessage(
	input: Api.TypeInputPeer,
	message: string,
	media: Api.TypeInputMedia[],
	entities?: any[],
) {
	const client = await getClient();
	const now = Date.now();
	const multi: any[] = media.map((m, idx) => new Api.InputSingleMedia({ media: m, randomId: BigInt(now + idx), message: '', entities: [] } as any));
	// Attach caption to the first item; others must still have a string per TL schema
	if (multi.length > 0) {
		(multi[0] as any).message = message ?? '';
		(multi[0] as any).entities = entities ?? [];
	}
	const res = await client.invoke(new Api.messages.SendMultiMedia({
		peer: input,
		multiMedia: multi,
	} as any));
	return res as any;
}

// Deprecated topic-specific media helpers removed

export async function joinChannelById(channelId: number, accessHash: string | bigint) {
	const client = await getClient();
	try {
		const input = new Api.InputChannel({ channelId, accessHash } as any);
		await client.invoke(new Api.channels.JoinChannel({ channel: input } as any));
	} catch (e: any) {
		const msg: string = String(e?.message || e?.errorMessage || '');
		if (msg.toUpperCase().includes('USER_ALREADY_PARTICIPANT')) return;
		throw e;
	}
}