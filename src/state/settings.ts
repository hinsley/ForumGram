import { create } from 'zustand';

interface SettingsState {
	markdownEnabled: boolean;
	katexEnabled: boolean;
	forumSecret: string | null;
	theme: 'midnight' | 'light' | 'monokai' | 'catpuccin';
	setMarkdown: (on: boolean) => void;
	setKatex: (on: boolean) => void;
	setForumSecret: (secret: string | null) => void;
	setTheme: (theme: SettingsState['theme']) => void;
	initFromStorage: () => void;
}

const THEME_KEY = 'fg_theme_v1';

export const useSettingsStore = create<SettingsState>((set) => ({
	markdownEnabled: true,
	katexEnabled: true,
	forumSecret: null,
	theme: 'midnight',
	setMarkdown: (on) => set({ markdownEnabled: on }),
	setKatex: (on) => set({ katexEnabled: on }),
	setForumSecret: (secret) => set({ forumSecret: secret }),
	setTheme: (theme) => {
		try { localStorage.setItem(THEME_KEY, theme); } catch {}
		set({ theme });
	},
	initFromStorage: () => {
		try {
			const stored = localStorage.getItem(THEME_KEY) as SettingsState['theme'] | null;
			if (stored) {
				set({ theme: stored });
			}
		} catch {}
	},
}));