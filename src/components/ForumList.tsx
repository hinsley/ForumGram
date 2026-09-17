import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForumsStore } from '@state/forums';
import { useForumAvatarUrl } from '@lib/resourceCache';
function ForumAvatar({ id, title }: { id: number; title: string }) {
	const url = useForumAvatarUrl(id);
	return <div className="forum-avatar">{url ? <img src={url} alt="" /> : title.charAt(0).toUpperCase()}</div>;
}

export default function ForumList() {
	const forums = useForumsStore((s) => s.forums);
	const removeForum = useForumsStore((s) => s.removeForum);
	const navigate = useNavigate();
	const location = useLocation();
	const [openMenuForId, setOpenMenuForId] = useState<number | null>(null);

	const items = useMemo(() => {
		return Object.values(forums)
			.filter((f) => f && f.id)
			.sort((a, b) => {
				const aName = (a.title || a.username || '').toLowerCase();
				const bName = (b.title || b.username || '').toLowerCase();
				return aName.localeCompare(bName);
			});
	}, [forums]);

	return (
		<nav className="forum-navigation" aria-label="Your forums">
			<div className="section-heading"><h2 className="eyebrow">FORUMS</h2><Link className="btn ghost" to="/discover?add=1" aria-label="Add forum">+</Link></div>
			{items.length === 0 ? <div className="sidebar-empty"><p className="muted">No forums yet.</p><Link to="/discover?add=1">Join one →</Link></div> : (
				<div className="list">
					{items.map((f) => (
						<div className={`forum-nav-item ${location.pathname.split('/')[2] === String(f.id) ? 'active' : ''}`} key={f.id}>
							<Link className="forum-nav-link" to={`/forum/${f.id}`} aria-current={location.pathname.split('/')[2] === String(f.id) ? 'page' : undefined}>
								<ForumAvatar id={f.id} title={f.title || '#'} />
								<div><div className="title">{f.title ?? (f.username ? `@${f.username}` : `Forum ${f.id}`)}</div></div>
							</Link>
							<button className="btn ghost forum-menu-button" onClick={() => setOpenMenuForId(openMenuForId === f.id ? null : f.id)} aria-label={`Options for ${f.title || 'forum'}`} aria-expanded={openMenuForId === f.id}>⋯</button>
							{openMenuForId === f.id && <div className="card forum-menu"><button className="btn danger" onClick={() => {
								if (!confirm('Remove this forum from your sidebar? Your content will not be deleted.')) return;
								removeForum(f.id);
								setOpenMenuForId(null);
								if (location.pathname.split('/')[2] === String(f.id)) navigate('/');
							}}>Remove from sidebar</button></div>}
						</div>
					))}
				</div>
			)}
		</nav>
	);
}