import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import LoginPage from '@features/auth/LoginPage';
import DiscoverPage from '@features/catalog/DiscoverPage';
import ForumPage from '@features/forum/ForumPage';
import BackupPage from '@features/backup/BackupPage';
import SettingsPage from '@features/settings/SettingsPage';
import { useSessionStore } from '@state/session';
import BoardPage from '@features/forum/BoardPage';

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
				<NavLink to="/discover" className="btn ghost">Discover</NavLink>
				<NavLink to="/settings" className="btn ghost">Settings</NavLink>
				<NavLink to="/backup" className="btn ghost">Backup</NavLink>
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
	return (
		<div className="app-shell">
			<Header />
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/discover" element={<RequireAuth><DiscoverPage /></RequireAuth>} />
				<Route path="/forum/:id" element={<RequireAuth><ForumPage /></RequireAuth>} />
				<Route path="/forum/:id/board/:boardId" element={<RequireAuth><BoardPage /></RequireAuth>} />
				<Route path="/backup" element={<RequireAuth><BackupPage /></RequireAuth>} />
				<Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
				<Route path="*" element={<RequireAuth><DiscoverPage /></RequireAuth>} />
			</Routes>
		</div>
	);
}