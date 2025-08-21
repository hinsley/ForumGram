import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import LoginPage from '@features/auth/LoginPage';
import DiscoverPage from '@features/catalog/DiscoverPage';
import ForumPage from '@features/forum/ForumPage';
import SettingsPage from '@features/settings/SettingsPage';
import { useSessionStore } from '@state/session';
import BoardPage from '@features/forum/BoardPage';
import { useEffect } from 'react';
import { useSettingsStore } from '@state/settings';

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
					<button className="btn" onClick={() => { logout(); navigate('/login'); }}>Logout</button>
				) : (
					<NavLink to="/login" className="btn primary">Login</NavLink>
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
				<Route path="/forum/:id/board/:boardId/thread/:threadId" element={<RequireAuth><BoardPage /></RequireAuth>} />
				<Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
				<Route path="*" element={<RequireAuth><DiscoverPage /></RequireAuth>} />
			</Routes>
		</div>
	);
}