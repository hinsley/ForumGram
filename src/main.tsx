import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/App';
import '@styles/theme.css';
import { registerSW } from 'virtual:pwa-register';
import { useForumsStore } from '@state/forums';

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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</QueryClientProvider>
	</StrictMode>
);