import { create } from 'zustand';
import { assertAccountScope, captureAccountScope, onAccountDispose, type AccountScope } from '@lib/accountScope';

export interface ForumMeta {
	id: number;
	title?: string;
	username?: string;
	accessHash?: string | bigint;
	isForum?: boolean;
	isPublic?: boolean;
}

interface ForumsState {
	forums: Record<number, ForumMeta>;
	selectedForumId: number | null;
	addOrUpdateForum: (meta: ForumMeta, scope?: AccountScope) => void;
	removeForum: (id: number) => void;
	selectForum: (id: number | null) => void;
	getForum: (id: number) => ForumMeta | undefined;
	hydrateAccount: (scope: AccountScope) => void;
}

function storageKey(scope: AccountScope): string { return `fg_forums_v2:${scope.accountId}`; }

function persist(forums: Record<number, ForumMeta>, scope: AccountScope): void {
	assertAccountScope(scope);
	try {
		localStorage.setItem(storageKey(scope), JSON.stringify(forums, (_key, value) => typeof value === 'bigint' ? String(value) : value));
	} catch { /* Persistence is optional; the verified in-memory account remains usable. */ }
}

export const useForumsStore = create<ForumsState>((set, get) => ({
	forums: {},
	selectedForumId: null,
	addOrUpdateForum: (meta, scope = captureAccountScope()) => {
		assertAccountScope(scope);
		const forums = { ...get().forums, [meta.id]: { ...get().forums[meta.id], ...meta } };
		persist(forums, scope);
		set({ forums });
	},
	removeForum: (id) => {
		const scope = captureAccountScope();
		const forums = { ...get().forums };
		delete forums[id];
		persist(forums, scope);
		set({ forums, selectedForumId: get().selectedForumId === id ? null : get().selectedForumId });
	},
	selectForum: (id) => { captureAccountScope(); set({ selectedForumId: id }); },
	getForum: (id) => get().forums[id],
	hydrateAccount: (scope) => {
		assertAccountScope(scope);
		const forums: Record<number, ForumMeta> = {};
		try {
			localStorage.removeItem('fg_forums_v1');
			const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(scope)) ?? '{}');
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				for (const [key, value] of Object.entries(parsed)) {
					const id = Number(key);
					if (!Number.isSafeInteger(id) || id <= 0 || !value || typeof value !== 'object') continue;
					const row = value as Record<string, unknown>;
					forums[id] = {
						id,
						title: typeof row.title === 'string' ? row.title : undefined,
						username: typeof row.username === 'string' ? row.username : undefined,
						accessHash: typeof row.accessHash === 'string' && /^-?\d+$/.test(row.accessHash) ? row.accessHash : undefined,
						isForum: row.isForum === true,
						isPublic: row.isPublic === true,
					};
				}
			}
		} catch { /* Corrupt/unavailable storage starts with an empty account sidebar. */ }
		set({ forums, selectedForumId: null });
	},
}));

try { localStorage.removeItem('fg_forums_v1'); } catch {}
onAccountDispose((scope) => {
	useForumsStore.setState({ forums: {}, selectedForumId: null });
	try { localStorage.removeItem(storageKey(scope)); } catch {}
});
