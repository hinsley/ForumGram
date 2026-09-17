import { QueryClient } from '@tanstack/react-query';
import { onAccountDispose } from './accountScope';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: false, staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false },
		mutations: { retry: false },
	},
});

onAccountDispose(() => {
	void queryClient.cancelQueries();
	queryClient.clear();
});
