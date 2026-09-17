import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { computeCheck } from 'telegram/Password';
import { generateRandomLong } from 'telegram/Helpers';
import { TG_API_HASH, TG_API_ID } from './constants';
import { abortError, assertAccountGeneration, assertAccountScope, captureAccountScope, getAccountGeneration, invalidateAccount, onAuthInvalidate, waitForAccountDisposal } from '@lib/accountScope';
import type { AccountScope } from '@lib/accountScope';
import { publishVerifiedAccount } from '@state/session';

interface ClientOwner {
	client: TelegramClient;
	generation: number;
	connected: Promise<void>;
	verified: boolean;
}
let owner: ClientOwner | null = null;

async function disconnect(client: TelegramClient): Promise<void> {
	try { await client.disconnect(); } catch { /* Local invalidation already completed. */ }
}

onAuthInvalidate((remoteLogout) => {
	const old = owner;
	owner = null;
	if (!old) return;
	// Never acquire/connect a client to log out. Bound network cleanup separately
	// from the local account-disposal barrier so offline logout is immediate.
	void (async () => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			if (remoteLogout && old.verified && old.client.connected) {
				await Promise.race([
					old.client.invoke(new Api.auth.LogOut()).catch(() => {}),
					new Promise<void>((resolve) => { timer = setTimeout(resolve, 1500); }),
				]);
			}
		} finally {
			if (timer !== undefined) clearTimeout(timer);
			await disconnect(old.client);
		}
	})();
});

function assertOwner(candidate: ClientOwner): void {
	assertAccountGeneration(candidate.generation);
	if (owner !== candidate) throw abortError();
}

async function createOwnedClient(session: string, generation: number): Promise<ClientOwner> {
	await waitForAccountDisposal(generation);
	assertAccountGeneration(generation);
	if (owner) throw new Error('An authentication attempt is already active.');
	const client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 2 });
	const candidate: ClientOwner = { client, generation, connected: Promise.resolve(), verified: false };
	owner = candidate;
	candidate.connected = (async () => {
		try { await client.connect(); assertOwner(candidate); }
		catch (error) {
			if (owner === candidate) owner = null;
			await disconnect(client);
			throw error;
		}
	})();
	await candidate.connected;
	assertOwner(candidate);
	return candidate;
}

async function verifyAndPublish(candidate: ClientOwner): Promise<void> {
	assertOwner(candidate);
	const me = await candidate.client.getMe();
	assertOwner(candidate);
	const id = Number(me?.id);
	if (!me || !Number.isSafeInteger(id) || id <= 0 || !(me instanceof Api.User)) throw new Error('Telegram did not return a valid account identity.');
	candidate.verified = true;
	try {
		const session = candidate.client.session;
		if (!(session instanceof StringSession)) throw new Error('Unexpected Telegram session type.');
		await publishVerifiedAccount({ id, firstName: me.firstName, lastName: me.lastName, username: me.username }, session.save(), candidate.generation);
		assertOwner(candidate);
	} catch (error) {
		if (owner === candidate) { owner = null; candidate.verified = false; }
		await disconnect(candidate.client);
		throw error;
	}
}

export async function restoreSession(session: string, generation: number): Promise<void> {
	const candidate = await createOwnedClient(session, generation);
	try { await verifyAndPublish(candidate); }
	catch (error) {
		if (owner === candidate) owner = null;
		await disconnect(candidate.client);
		throw error;
	}
}

export async function getClient(scope = captureAccountScope()): Promise<TelegramClient> {
	assertAccountScope(scope);
	const candidate = owner;
	if (!candidate?.verified || candidate.generation !== scope.generation) throw abortError();
	await candidate.connected;
	assertAccountScope(scope);
	assertOwner(candidate);
	return candidate.client;
}

export async function sendCode(phone: string): Promise<{ phoneCodeHash: string; generation: number }> {
	// Every new code request starts with an empty StringSession, never a prior
	// account's cached authorized client (including a failed saved bootstrap).
	void invalidateAccount();
	const generation = getAccountGeneration();
	const candidate = await createOwnedClient('', generation);
	assertOwner(candidate);
	const result = await candidate.client.invoke(new Api.auth.SendCode({ phoneNumber: phone, apiId: TG_API_ID, apiHash: TG_API_HASH, settings: new Api.CodeSettings({}) }));
	assertOwner(candidate);
	if (!('phoneCodeHash' in result) || !result.phoneCodeHash) throw new Error('Telegram did not return a sign-in code token.');
	return { phoneCodeHash: result.phoneCodeHash, generation };
}

export async function signIn(phone: string, code: string, phoneCodeHash: string, password: string | undefined, generation: number): Promise<void> {
	const candidate = owner;
	assertAccountGeneration(generation);
	if (!candidate || candidate.generation !== generation || candidate.verified) throw abortError();
	assertOwner(candidate);
	try {
		if (password) {
			const parameters = await candidate.client.invoke(new Api.account.GetPassword());
			assertOwner(candidate);
			const passwordSrp = await computeCheck(parameters, password);
			assertOwner(candidate);
			await candidate.client.invoke(new Api.auth.CheckPassword({ password: passwordSrp }));
		} else {
			await candidate.client.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCode: code, phoneCodeHash }));
		}
		assertOwner(candidate);
		await verifyAndPublish(candidate);
	} catch (error) { assertOwner(candidate); throw error; }
}

export async function sendPlainMessage(input: Api.TypeInputPeer, message: string, entities?: Api.TypeMessageEntity[], scope = captureAccountScope()) {
	const client = await getClient(scope);
	assertAccountScope(scope);
	const result = await client.sendMessage(input, { message, formattingEntities: entities });
	assertAccountScope(scope);
	return result;
}

export async function deleteMessages(input: Api.TypeInputPeer, messageIds: number[], scope = captureAccountScope()) {
	const client = await getClient(scope);
	assertAccountScope(scope);
	await client.deleteMessages(input, messageIds, { revoke: true });
	assertAccountScope(scope);
}

export async function editMessage(input: Api.TypeInputPeer, messageId: number, message: string, entities?: Api.TypeMessageEntity[], scope = captureAccountScope()) {
	const client = await getClient(scope);
	assertAccountScope(scope);
	const result = await client.invoke(new Api.messages.EditMessage({ peer: input, id: messageId, message, entities }));
	assertAccountScope(scope);
	return result;
}

export async function sendMediaMessage(input: Api.TypeInputPeer, message: string, media: Api.TypeInputMedia, entities?: Api.TypeMessageEntity[], scope = captureAccountScope()) {
	const client = await getClient(scope);
	assertAccountScope(scope);
	const result = await client.invoke(new Api.messages.SendMedia({ peer: input, media, message, entities }));
	assertAccountScope(scope);
	return result;
}

export async function sendMultiMediaMessage(input: Api.TypeInputPeer, message: string, media: Api.TypeInputMedia[], entities?: Api.TypeMessageEntity[], scope = captureAccountScope()) {
	const client = await getClient(scope);
	const multiMedia = media.map((item, index) => new Api.InputSingleMedia({ media: item, randomId: generateRandomLong(), message: index === 0 ? message : '', entities: index === 0 ? entities : [] }));
	assertAccountScope(scope);
	const result = await client.invoke(new Api.messages.SendMultiMedia({ peer: input, multiMedia }));
	assertAccountScope(scope);
	return result;
}

function extractInviteHash(input: string): string {
	const trimmed = input.trim();
	if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
	const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
	if (!['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me'].includes(url.hostname)) throw new Error('Invalid Telegram invite link');
	const segments = url.pathname.split('/').filter(Boolean);
	const hash = segments[0] === 'joinchat' ? segments[1] : segments[0]?.startsWith('+') ? segments[0].slice(1) : '';
	if (!hash || !/^[A-Za-z0-9_-]+$/.test(hash)) throw new Error('Invalid Telegram invite link');
	return hash;
}

export async function joinInviteLink(linkOrHash: string, scope: AccountScope = captureAccountScope()) {
	const hash = extractInviteHash(linkOrHash);
	const client = await getClient(scope);
	assertAccountScope(scope);
	try {
		const result = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
		assertAccountScope(scope);
		return result;
	} catch (error) {
		assertAccountScope(scope);
		if (!error || typeof error !== 'object' || !('errorMessage' in error) || error.errorMessage !== 'USER_ALREADY_PARTICIPANT') throw error;
		const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
		assertAccountScope(scope);
		if (!(invite instanceof Api.ChatInviteAlready)) throw error;
		return { chats: [invite.chat] };
	}
}

export async function joinPublicByUsername(usernameOrAt: string, scope: AccountScope = captureAccountScope()) {
	const client = await getClient(scope);
	assertAccountScope(scope);
	const result = await client.invoke(new Api.contacts.ResolveUsername({ username: usernameOrAt.replace(/^@/, '') }));
	assertAccountScope(scope);
	const channel = result.chats.find((chat): chat is Api.Channel => chat instanceof Api.Channel);
	if (!channel) throw new Error('No public forum found for this handle');
	try {
		assertAccountScope(scope);
		await client.invoke(new Api.channels.JoinChannel({ channel: new Api.InputChannel({ channelId: channel.id, accessHash: channel.accessHash! }) }));
	} catch (error) {
		assertAccountScope(scope);
		if (!error || typeof error !== 'object' || !('errorMessage' in error) || error.errorMessage !== 'USER_ALREADY_PARTICIPANT') throw error;
	}
	assertAccountScope(scope);
	return channel;
}
