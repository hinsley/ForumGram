import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './app/App';
import '@styles/theme.css';
import { registerSW } from 'virtual:pwa-register';
import { useSessionStore } from '@state/session';
import { queryClient } from '@lib/queryClient';
import { useSettingsStore } from '@state/settings';


registerSW({ immediate: true });

// Private stores hydrate only after the saved session's identity is verified.
void useSessionStore.getState().bootstrap();

// Apply initial theme before React renders to minimize flash
try { document.documentElement.setAttribute('data-theme', useSettingsStore.getState().theme); } catch {}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</QueryClientProvider>
	</StrictMode>
);