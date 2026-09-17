import { afterEach, describe, expect, it, vi } from 'vitest';

const control = vi.hoisted(() => ({
	clients: [] as Array<{ connected: boolean; disconnect: () => Promise<void> }>,
	connect: () => Promise.resolve(),
	identity: () => Promise.resolve({ id: 1, firstName: 'A' }),
	channels: [] as Array<{ onmessage: ((event: { data: unknown }) => void) | null }>,
}));

vi.mock('telegram', () => {
	class User { constructor(data: object) { Object.assign(this, data); } }
	class SendCode {}
	class SignIn {}
	class LogOut {}
	return {
		Api: { User, auth: { SendCode, SignIn, LogOut }, CodeSettings: class {} },
		TelegramClient: class {
			connected = false;
			disconnect = vi.fn(async () => { this.connected = false; });
			constructor(public session: unknown) { control.clients.push(this); }
			async connect() { await control.connect(); this.connected = true; }
			async getMe() { return new User(await control.identity()); }
			async invoke(request: unknown) {
				if (request instanceof SendCode) return { phoneCodeHash: 'code-token' };
				if (request instanceof LogOut) throw new Error('offline');
				return {};
			}
		},
	};
});
vi.mock('telegram/sessions', () => ({ StringSession: class { constructor(public value: string) {} save() { return this.value || 'synthetic-session'; } } }));
vi.mock('telegram/Password', () => ({ computeCheck: vi.fn() }));
vi.mock('telegram/Helpers', () => ({ generateRandomLong: vi.fn() }));
vi.mock('./constants', () => ({ TG_API_ID: 1, TG_API_HASH: 'synthetic' }));

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('authentication generation ownership', () => {
	it('blocks late connect and identity, uses a fresh B client, and invalidates a same-account tab offline', async () => {
		vi.resetModules();
		const storage = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => { storage.set(key, value); },
			removeItem: (key: string) => { storage.delete(key); },
		});
		vi.stubGlobal('window', new EventTarget());
		vi.stubGlobal('BroadcastChannel', class {
			onmessage: ((event: { data: unknown }) => void) | null = null;
			constructor() { control.channels.push(this); }
			postMessage() {}
		});
		const session = await import('@state/session');
		const lifecycle = await import('@lib/accountScope');
		const client = await import('./client');
		await session.useSessionStore.getState().bootstrap();
		const lateConnect = deferred();
		control.connect = () => lateConnect.promise;
		const staleLogin = client.sendCode('+10000000000');
		await vi.waitFor(() => expect(control.clients.length).toBe(1));
		session.useSessionStore.getState().logout();
		lateConnect.resolve();
		await expect(staleLogin).rejects.toThrow();
		await expect(client.getClient()).rejects.toThrow();
		expect(control.clients[0].connected).toBe(false);

		control.connect = () => Promise.resolve();
		const lateIdentity = deferred();
		control.identity = async () => { await lateIdentity.promise; return { id: 1, firstName: 'A' }; };
		const pendingA = await client.sendCode('+10000000000');
		const aLogin = client.signIn('+10000000000', '123', pendingA.phoneCodeHash, undefined, pendingA.generation);
		await Promise.resolve();
		session.useSessionStore.getState().logout();
		lateIdentity.resolve();
		await expect(aLogin).rejects.toThrow();
		expect(session.useSessionStore.getState().user).toBeNull();

		control.identity = async () => ({ id: 1, firstName: 'A' });
		const a = await client.sendCode('+10000000000');
		await client.signIn('+10000000000', '123', a.phoneCodeHash, undefined, a.generation);
		const scopeA = lifecycle.captureAccountScope();
		const forums = await import('@state/forums');
		forums.useForumsStore.getState().addOrUpdateForum({ id: 10, title: 'A private' }, scopeA);
		const settings = await import('@state/settings');
		settings.useSettingsStore.getState().setForumSecret('A private secret');
		const oldClient = await client.getClient(scopeA);
		const count = control.clients.length;
		session.useSessionStore.getState().logout();
		expect(control.clients.length).toBe(count);
		expect(scopeA.signal.aborted).toBe(true);
		expect(settings.useSettingsStore.getState().forumSecret).toBeNull();
		expect(forums.useForumsStore.getState().forums).toEqual({});
		control.identity = async () => ({ id: 2, firstName: 'B' });
		const b = await client.sendCode('+20000000000');
		await client.signIn('+20000000000', '456', b.phoneCodeHash, undefined, b.generation);
		expect(session.useSessionStore.getState().user?.id).toBe(2);
		expect(await client.getClient()).not.toBe(oldClient);
		await expect(client.getClient(scopeA)).rejects.toThrow();
		expect(forums.useForumsStore.getState().forums).toEqual({});
		const scopeB = lifecycle.captureAccountScope();
		control.channels[0].onmessage?.({ data: { accountId: '2', nonce: 'other-tab' } });
		expect(scopeB.signal.aborted).toBe(true);
		expect(session.useSessionStore.getState().isAuthenticated).toBe(false);
		await expect(client.getClient()).rejects.toThrow();
	});
});
