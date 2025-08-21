import { create } from 'zustand';

interface SettingsState {
	markdownEnabled: boolean;
	katexEnabled: boolean;
	forumSecret: string | null;
	theme: 'forumgram-blue' | 'monokai-dimmed' | 'catppuccin-mocha' | 'telegram-light';
	imageMaxWidthPx: number;
	setMarkdown: (on: boolean) => void;
	setKatex: (on: boolean) => void;
	setForumSecret: (secret: string | null) => void;
	setImageMaxWidthPx: (px: number) => void;
	setTheme: (theme: SettingsState['theme']) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
	markdownEnabled: true,
	katexEnabled: true,
	forumSecret: null,
	theme: 'forumgram-blue',
	imageMaxWidthPx: 480,
	setMarkdown: (on) => set({ markdownEnabled: on }),
	setKatex: (on) => set({ katexEnabled: on }),
	setForumSecret: (secret) => set({ forumSecret: secret }),
	setImageMaxWidthPx: (px) => set({ imageMaxWidthPx: Math.max(100, Math.min(4000, Math.round(px))) }),
	setTheme: (theme) => set({ theme }),
}));