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
}

export const useForumsStore = create<ForumsState>((set, get) => ({
	forums: {},
	selectedForumId: null,
	addOrUpdateForum: (meta) => set((s) => ({ forums: { ...s.forums, [meta.id]: { ...(s.forums[meta.id] ?? {}), ...meta } } })),
	selectForum: (id) => set({ selectedForumId: id }),
	getForum: (id) => get().forums[id],
}));