import { create } from 'zustand';
import { activateAccount, assertAccountGeneration, assertAccountScope, getAccountGeneration, invalidateAccount, onAuthInvalidate } from '@lib/accountScope';
import { useForumsStore } from './forums';
import { useSettingsStore } from './settings';
import '@lib/queryClient';

export interface MinimalUserInfo {
	id: number;
	firstName?: string;
	lastName?: string;
	username?: string;
}

interface SessionState {
	isAuthenticated: boolean;
	isBootstrapping: boolean;
	bootstrapError: string | null;
	user: MinimalUserInfo | null;
	bootstrap: () => Promise<void>;
	logout: () => void;
}

const SESSION_KEY = 'tg_session';
const INVALIDATION_KEY = 'fg_account_invalidation';
let bootstrapPromise: Promise<void> | null = null;
let bootstrapped = false;
let channel: BroadcastChannel | null = null;

export const useSessionStore = create<SessionState>(() => ({
	isAuthenticated: false,
	isBootstrapping: true,
	bootstrapError: null,
	user: null,
	bootstrap: () => {
		if (bootstrapPromise) return bootstrapPromise;
		if (bootstrapped) return Promise.resolve();
		const generation = getAccountGeneration();
		useSessionStore.setState({ isBootstrapping: true, bootstrapError: null });
		bootstrapPromise = (async () => {
			try {
				let session: string | null = null;
				try { session = localStorage.getItem(SESSION_KEY); } catch {}
				if (session) {
					// Saved-session verification lazily loads GramJS; an empty login shell does not.
					const { restoreSession } = await import('@lib/telegram/client');
					assertAccountGeneration(generation);
					await restoreSession(session, generation);
				}
				assertAccountGeneration(generation);
				bootstrapped = true;
			} catch (error) {
				if (getAccountGeneration() === generation) {
					useSessionStore.setState({ bootstrapError: 'Could not verify your saved Telegram session. Retry when online, or sign in again.' });
				}
			} finally {
				bootstrapPromise = null;
				if (getAccountGeneration() === generation) useSessionStore.setState({ isBootstrapping: false });
			}
		})();
		return bootstrapPromise;
	},
	logout: () => logoutLocally(true),
}));

// Called only by the auth client after Telegram getMe verifies the identity.
// No session bytes are exposed through a public store or getter.
export async function publishVerifiedAccount(user: MinimalUserInfo, session: string, generation: number): Promise<void> {
	assertAccountGeneration(generation);
	const scope = await activateAccount(String(user.id), generation);
	assertAccountScope(scope);
	useForumsStore.getState().hydrateAccount(scope);
	try { localStorage.setItem(SESSION_KEY, session); } catch {}
	bootstrapped = true;
	useSessionStore.setState({ user, isAuthenticated: true, isBootstrapping: false, bootstrapError: null });
}

function logoutLocally(broadcast: boolean): void {
	const accountId = useSessionStore.getState().user?.id;
	void invalidateAccount(broadcast);
	bootstrapped = true;
	try { localStorage.removeItem(SESSION_KEY); } catch {}
	if (broadcast) {
		const event = { accountId: accountId === undefined ? null : String(accountId), nonce: `${Date.now()}:${Math.random()}` };
		try { localStorage.setItem(INVALIDATION_KEY, JSON.stringify(event)); } catch {}
		try { channel?.postMessage(event); } catch {}
	}
}

onAuthInvalidate(() => {
	useSessionStore.setState({ isAuthenticated: false, isBootstrapping: false, user: null, bootstrapError: null });
	useForumsStore.setState({ forums: {}, selectedForumId: null });
	useSettingsStore.getState().setForumSecret(null);
});

function receiveInvalidation(data: unknown): void {
	if (!data || typeof data !== 'object' || !('accountId' in data)) return;
	const id = (data as { accountId: unknown }).accountId;
	const currentId = useSessionStore.getState().user?.id;
	if (id === null || currentId === undefined || id === String(currentId)) {
		// Do not delete a replacement session another tab may already have saved.
		void invalidateAccount();
		bootstrapped = true;
	}
}

if (typeof window !== 'undefined') {
	window.addEventListener('storage', (event) => {
		if (event.key === INVALIDATION_KEY && event.newValue) {
			try { receiveInvalidation(JSON.parse(event.newValue)); } catch {}
		} else if (event.key === SESSION_KEY && event.oldValue !== event.newValue) {
			// Session replacement never silently switches another tab's account.
			// Do not remove the replacing tab's newly saved session.
			void invalidateAccount();
			bootstrapped = true;
		}
	});
	try {
		channel = new BroadcastChannel('fg_account_lifecycle');
		channel.onmessage = (event) => receiveInvalidation(event.data);
	} catch { /* Storage events remain available where BroadcastChannel is not. */ }
}
