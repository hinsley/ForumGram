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

	if (items.length === 0) return null;

	return (
		<div className="col">
			<h4>Your forums</h4>
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

