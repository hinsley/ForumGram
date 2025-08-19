import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForumsStore } from '@state/forums';

export default function ForumList() {
	const forums = useForumsStore((s) => s.forums);
	const navigate = useNavigate();

	const items = useMemo(() => {
		return Object.values(forums)
			.filter((f) => f && f.id)
			.sort((a, b) => {
				const aName = (a.title || a.username || '').toLowerCase();
				const bName = (b.title || b.username || '').toLowerCase();
				return aName.localeCompare(bName);
			});
	}, [forums]);

	if (items.length === 0) {
		return (
			<div className="col">
				<div className="row" style={{ alignItems: 'center' }}>
					<h4 style={{ margin: 0 }}>Forums</h4>
					<div className="spacer" />
					<button className="btn ghost" onClick={() => navigate('/discover?add=1')} title="Add forum">+</button>
				</div>
				<div className="sub" style={{ color: 'var(--muted)' }}>No forums yet. Click + to add.</div>
			</div>
		);
	}

	return (
		<div className="col">
			<div className="row" style={{ alignItems: 'center' }}>
				<h4 style={{ margin: 0 }}>Forums</h4>
				<div className="spacer" />
				<button className="btn ghost" onClick={() => navigate('/discover?add=1')} title="Add forum">+</button>
			</div>
			<div className="list">
				{items.map((f) => (
					<div className="list-item" key={f.id} onClick={() => navigate(`/forum/${f.id}`)}>
						<div className="col">
							<div className="title">{f.title ?? (f.username ? `@${f.username}` : `Forum ${f.id}`)}</div>
							<div className="sub">{f.isPublic ? 'Public' : 'Private'}{f.username ? ` • @${f.username}` : ''}</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

