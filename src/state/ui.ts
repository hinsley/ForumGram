import { create } from 'zustand';

interface UiState {
	isSidebarCollapsed: boolean;
	setSidebarCollapsed: (collapsed: boolean) => void;
	toggleSidebar: () => void;
}

const STORAGE_KEY = 'ui_sidebar_collapsed';

export const useUiStore = create<UiState>((set, get) => {
	const initialCollapsed = (() => {
		try {
			return localStorage.getItem(STORAGE_KEY) === '1';
		} catch {
			return false;
		}
	})();
	return {
		isSidebarCollapsed: initialCollapsed,
		setSidebarCollapsed: (collapsed) => {
			try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch {}
			set({ isSidebarCollapsed: collapsed });
		},
		toggleSidebar: () => {
			const next = !get().isSidebarCollapsed;
			try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch {}
			set({ isSidebarCollapsed: next });
		},
	};
}); 