import { create } from 'zustand';

export interface ForumMeta {
	id: number; // channel id
	title?: string;
	username?: string;
	accessHash?: string | bigint;
	isForum?: boolean;
	isPublic?: boolean;
}

interface ForumsState {
	forums: Record<number, ForumMeta>;
	selectedForumId: number | null;
	addOrUpdateForum: (meta: ForumMeta) => void;
	selectForum: (id: number | null) => void;
	getForum: (id: number) => ForumMeta | undefined;
	initFromStorage: () => void;
}

export const useForumsStore = create<ForumsState>((set, get) => ({
	forums: {},
	selectedForumId: null,
	addOrUpdateForum: (meta) => set((s) => {
		const merged = { ...(s.forums[meta.id] ?? {}), ...meta } as ForumMeta;
		// Ensure accessHash is persisted safely (JSON doesn't support BigInt)
		const nextForums: Record<number, ForumMeta> = { ...s.forums, [meta.id]: merged };
		try {
			const serializable: Record<string, any> = {};
			for (const [key, value] of Object.entries(nextForums)) {
				serializable[key] = {
					...value,
					accessHash: value.accessHash !== undefined && value.accessHash !== null ? String(value.accessHash) : undefined,
				};
			}
			localStorage.setItem('fg_forums_v1', JSON.stringify(serializable));
		} catch {}
		return { forums: nextForums };
	}),
	selectForum: (id) => set({ selectedForumId: id }),
	getForum: (id) => get().forums[id],
	initFromStorage: () => {
		try {
			const raw = localStorage.getItem('fg_forums_v1');
			if (!raw) return;
			const parsed = JSON.parse(raw) as Record<string, any>;
			const restored: Record<number, ForumMeta> = {};
			for (const [key, val] of Object.entries(parsed)) {
				const idNum = Number(key);
				const accessHash = val.accessHash !== undefined && val.accessHash !== null ? BigInt(val.accessHash) : undefined;
				restored[idNum] = { ...val, id: idNum, accessHash } as ForumMeta;
			}
			set({ forums: restored });
		} catch {}
	},
}));