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

const THEME_STORAGE_KEY = 'settings_theme';
const MARKDOWN_STORAGE_KEY = 'settings_markdown';
const KATEX_STORAGE_KEY = 'settings_katex';
const DEFAULT_THEME: SettingsState['theme'] = 'forumgram-blue';

function loadInitialTheme(): SettingsState['theme'] {
	try {
		const raw = localStorage.getItem(THEME_STORAGE_KEY);
		if (raw === 'forumgram-blue' || raw === 'monokai-dimmed' || raw === 'catppuccin-mocha' || raw === 'telegram-light') return raw;
	} catch {}
	return DEFAULT_THEME;
}

function loadInitialBoolean(key: string, fallback: boolean): boolean {
	try {
		const raw = localStorage.getItem(key);
		if (raw === '1') return true;
		if (raw === '0') return false;
	} catch {}
	return fallback;
}

function persistBoolean(key: string, value: boolean) {
	try { localStorage.setItem(key, value ? '1' : '0'); } catch {}
}

export const useSettingsStore = create<SettingsState>((set) => ({
	markdownEnabled: loadInitialBoolean(MARKDOWN_STORAGE_KEY, true),
	katexEnabled: loadInitialBoolean(KATEX_STORAGE_KEY, true),
	forumSecret: null,
	theme: loadInitialTheme(),
	imageMaxWidthPx: 480,
	setMarkdown: (on) => { persistBoolean(MARKDOWN_STORAGE_KEY, on); set({ markdownEnabled: on }); },
	setKatex: (on) => { persistBoolean(KATEX_STORAGE_KEY, on); set({ katexEnabled: on }); },
	setForumSecret: (secret) => set({ forumSecret: secret }),
	setImageMaxWidthPx: (px) => set({ imageMaxWidthPx: Math.max(100, Math.min(4000, Math.round(px))) }),
	setTheme: (theme) => {
		try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
		set({ theme });
	},
}));