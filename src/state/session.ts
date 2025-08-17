import { create } from 'zustand';

export interface MinimalUserInfo {
	id: number;
	firstName?: string;
	lastName?: string;
	username?: string;
}

interface SessionState {
	isAuthenticated: boolean;
	phoneNumber: string | null;
	phoneCodeHash: string | null;
	sessionString: string | null;
	user: MinimalUserInfo | null;
	setPhone: (phone: string | null) => void;
	setPhoneCodeHash: (hash: string | null) => void;
	setSessionString: (session: string | null) => void;
	setUser: (user: MinimalUserInfo | null) => void;
	logout: () => void;
	initFromStorage: () => void;
}

const SESSION_KEY = 'tg_session';

export const useSessionStore = create<SessionState>((set) => ({
	isAuthenticated: false,
	phoneNumber: null,
	phoneCodeHash: null,
	sessionString: null,
	user: null,
	setPhone: (phone) => set({ phoneNumber: phone }),
	setPhoneCodeHash: (hash) => set({ phoneCodeHash: hash }),
	setSessionString: (session) => {
		if (session) {
			localStorage.setItem(SESSION_KEY, session);
		} else {
			localStorage.removeItem(SESSION_KEY);
		}
		set({ sessionString: session, isAuthenticated: Boolean(session) });
	},
	setUser: (user) => set({ user }),
	logout: () => {
		localStorage.removeItem(SESSION_KEY);
		set({ isAuthenticated: false, sessionString: null, user: null, phoneCodeHash: null, phoneNumber: null });
	},
	initFromStorage: () => {
		const session = localStorage.getItem(SESSION_KEY);
		set({ sessionString: session, isAuthenticated: Boolean(session) });
	},
}));

export function getStoredSessionString(): string | null {
	return localStorage.getItem(SESSION_KEY);
}