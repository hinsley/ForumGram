import { create } from 'zustand';

interface SettingsState {
	markdownEnabled: boolean;
	katexEnabled: boolean;
	forumSecret: string | null;
	theme: 'dark';
	imageMaxWidthPx: number;
	setMarkdown: (on: boolean) => void;
	setKatex: (on: boolean) => void;
	setForumSecret: (secret: string | null) => void;
	setImageMaxWidthPx: (px: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
	markdownEnabled: true,
	katexEnabled: true,
	forumSecret: null,
	theme: 'dark',
	imageMaxWidthPx: 480,
	setMarkdown: (on) => set({ markdownEnabled: on }),
	setKatex: (on) => set({ katexEnabled: on }),
	setForumSecret: (secret) => set({ forumSecret: secret }),
	setImageMaxWidthPx: (px) => set({ imageMaxWidthPx: Math.max(100, Math.min(4000, Math.round(px))) }),
}));