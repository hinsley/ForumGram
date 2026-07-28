import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import LoginPage from '@features/auth/LoginPage';
import DiscoverPage from '@features/catalog/DiscoverPage';
import ForumPage from '@features/forum/ForumPage';
import SettingsPage from '@features/settings/SettingsPage';
import { useSessionStore } from '@state/session';
import BoardPage from '@features/forum/BoardPage';
import { useEffect } from 'react';
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

function Header() {
	const navigate = useNavigate();
	const { isAuthenticated, logout } = useSessionStore();
	return (
		<header className="app-header">
			<div className="brand">
				<img src="/icon.svg" alt="ForumGram" />
				<Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>ForumGram</Link>
			</div>
			<nav className="header-actions">
				<NavLink to="/settings" className="btn ghost" title="Settings" aria-label="Settings">⚙️</NavLink>
				{isAuthenticated ? (
					<button className="btn" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
				) : (
					<NavLink to="/login" className="btn primary">Log in</NavLink>
				)}
			</nav>
		</header>
	);
}

function RequireAuth({ children }: { children: React.ReactNode }) {
	const { isAuthenticated } = useSessionStore();
	const location = useLocation();
	if (!isAuthenticated) {
		return <LoginPage redirectTo={location.pathname} />;
	}
	return <>{children}</>;
}

export default function App() {
	const theme = useSettingsStore((s) => s.theme);
	useEffect(() => {
		try { document.documentElement.setAttribute('data-theme', theme); } catch {}
	}, [theme]);
	return (
		<div className="app-shell">
			<Header />
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
		</div>
	);
}
