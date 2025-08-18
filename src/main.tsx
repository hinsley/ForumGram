import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/App';
import '@styles/theme.css';
import { registerSW } from 'virtual:pwa-register';
import { useForumsStore } from '@state/forums';
import { useSettingsStore } from '@state/settings';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			refetchOnWindowFocus: false,
		},
	},
});

registerSW({ immediate: true });

// Hydrate forums from localStorage on startup so the sidebar has recent forums
try { useForumsStore.getState().initFromStorage(); } catch {}
// Hydrate settings (theme) from localStorage and apply to document
try {
    const settings = useSettingsStore.getState();
    settings.initFromStorage();
    const applyTheme = (theme: typeof settings.theme) => {
        document.documentElement.setAttribute('data-theme', theme);
    };
    applyTheme(settings.theme);
    // subscribe to changes so switching themes updates immediately
    useSettingsStore.subscribe((s) => applyTheme(s.theme));
} catch {}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</QueryClientProvider>
	</StrictMode>
);