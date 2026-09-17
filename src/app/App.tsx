import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSessionStore } from '@state/session';
import { Component, lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '@state/settings';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { countPostsInThread } from '@lib/protocol';

const POSTS_PER_PAGE = 10;

function parseRequestedPage(value: string | undefined): number | null {
	if (!value || !/^[1-9]\d*$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function PaginatedBoardPage() {
	const { id, boardId, threadId, page } = useParams();
	const forumId = Number(id);
	const navigate = useNavigate();
	const requestedPage = parseRequestedPage(page);
	const hasThread = Boolean(threadId);

	const postCount = useQuery<number>({
		queryKey: ['post-count-for-route', forumId, threadId],
		queryFn: async () => {
			const input = getInputPeerForForumId(forumId);
			return countPostsInThread(input, String(threadId));
		},
		enabled: Number.isFinite(forumId) && hasThread && requestedPage !== null,
		staleTime: 0,
		retry: 1,
	});

	const totalPages = typeof postCount.data === 'number'
		? Math.max(1, Math.ceil(Math.max(0, postCount.data) / POSTS_PER_PAGE))
		: null;
	const canonicalPage = requestedPage === null || totalPages === null
		? null
		: Math.min(requestedPage, totalPages);

	useEffect(() => {
		if (!threadId || !boardId || !Number.isFinite(forumId)) return;
		const basePath = `/forum/${forumId}/board/${boardId}/thread/${threadId}/page`;
		if (requestedPage === null) {
			navigate(`${basePath}/1`, { replace: true });
			return;
		}
		if (canonicalPage !== null && canonicalPage !== requestedPage) {
			navigate(`${basePath}/${canonicalPage}`, { replace: true });
		}
	}, [boardId, canonicalPage, forumId, navigate, requestedPage, threadId]);

	if (hasThread && (
		requestedPage === null
		|| postCount.isLoading
		|| (canonicalPage !== null && canonicalPage !== requestedPage)
	)) {
		return null;
	}

	return <BoardPage />;
}

// Route splitting deliberately keeps Telegram/media/Markdown off the auth shell.
const LoginPage = lazy(() => import('@features/auth/LoginPage'));
const DiscoverPage = lazy(() => import('@features/catalog/DiscoverPage'));
const ForumPage = lazy(() => import('@features/forum/ForumPage'));
const BoardPage = lazy(() => import('@features/forum/BoardPage'));
const SettingsPage = lazy(() => import('@features/settings/SettingsPage'));

class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() { return { failed: true }; }
	render() {
		return this.state.failed ? <main className="main"><div className="card"><h2>This page could not load.</h2><p>Check your connection and reload to try again.</p><button className="btn primary" onClick={() => window.location.reload()}>Reload page</button></div></main> : this.props.children;
	}
}

function Header() {
	const navigate = useNavigate();
	const { isAuthenticated, logout } = useSessionStore();
	return (
		<header className="app-header">
			<Link className="brand" to="/" aria-label="ForumGram home">
				<img src="/icon.svg" alt="" />
				<span>Forum<span className="brand-accent">Gram</span></span>
			</Link>
			<nav className="header-actions" aria-label="Main navigation">
				{isAuthenticated ? (
					<>
						<NavLink to="/discover" className="nav-link">Discover</NavLink>
						<NavLink to="/settings" className="nav-link">Settings</NavLink>
						<button className="btn ghost" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
					</>
				) : (
					<span className="header-caption">A quieter place for conversation</span>
				)}
			</nav>
		</header>
	);
}

function RequireAuth({ children }: { children: React.ReactNode }) {
	const { isAuthenticated, isBootstrapping } = useSessionStore();
	const location = useLocation();
	if (isBootstrapping) return <main className="main" role="status">Verifying your Telegram session…</main>;
	if (!isAuthenticated) {
		return <LoginPage redirectTo={location.pathname} />;
	}
	return <>{children}</>;
}

export default function App() {
	const theme = useSettingsStore((s) => s.theme);
	const { pathname } = useLocation();
	const user = useSessionStore((s) => s.user);
	useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
	useEffect(() => {
		try { document.documentElement.setAttribute('data-theme', theme); } catch {}
	}, [theme]);
	return (
		<div className="app-shell">
			<Header />
			<RouteErrorBoundary key={`${user?.id ?? 'signed-out'}:${pathname}`}>
			<Suspense fallback={<main className="main" role="status">Loading…</main>}>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/discover" element={<RequireAuth><DiscoverPage /></RequireAuth>} />
				<Route path="/forum/:id" element={<RequireAuth><ForumPage /></RequireAuth>} />
				<Route path="/forum/:id/board/:boardId" element={<RequireAuth><BoardPage /></RequireAuth>} />
				<Route path="/forum/:id/board/:boardId/thread/:threadId" element={<RequireAuth><PaginatedBoardPage /></RequireAuth>} />
				<Route path="/forum/:id/board/:boardId/thread/:threadId/page/:page" element={<RequireAuth><PaginatedBoardPage /></RequireAuth>} />
				<Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
				<Route path="*" element={<RequireAuth><DiscoverPage /></RequireAuth>} />
			</Routes>
			</Suspense>
			</RouteErrorBoundary>
		</div>
	);
}
