import { create } from 'zustand';

interface SettingsState {
	markdownEnabled: boolean;
	katexEnabled: boolean;
	forumSecret: string | null;
	theme: 'dark';
	setMarkdown: (on: boolean) => void;
	setKatex: (on: boolean) => void;
	setForumSecret: (secret: string | null) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
	markdownEnabled: true,
	katexEnabled: true,
	forumSecret: null,
	theme: 'dark',
	setMarkdown: (on) => set({ markdownEnabled: on }),
	setKatex: (on) => set({ katexEnabled: on }),
	setForumSecret: (secret) => set({ forumSecret: secret }),
}));