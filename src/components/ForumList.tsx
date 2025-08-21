import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForumsStore } from '@state/forums';
import { getForumAvatarUrl } from '@lib/telegram/client';

export default function ForumList() {
	const forums = useForumsStore((s) => s.forums);
	const removeForum = useForumsStore((s) => s.removeForum);
	const navigate = useNavigate();
	const location = useLocation();
	const [openMenuForId, setOpenMenuForId] = useState<number | null>(null);
	const [avatarUrlById, setAvatarUrlById] = useState<Record<number, string | undefined>>({});

	const items = useMemo(() => {
		return Object.values(forums)
			.filter((f) => f && f.id)
			.sort((a, b) => {
				const aName = (a.title || a.username || '').toLowerCase();
				const bName = (b.title || b.username || '').toLowerCase();
				return aName.localeCompare(bName);
			});
	}, [forums]);

	useEffect(() => {
		let canceled = false;
		(async () => {
			const entries = await Promise.all(items.map(async (f) => {
				const url = await getForumAvatarUrl(f.id, f.accessHash);
				return [f.id, url] as const;
			}));
			if (!canceled) setAvatarUrlById(Object.fromEntries(entries));
		})();
		return () => { canceled = true; };
	}, [items.map(i => i.id).join(','), items.map(i => String(i.accessHash ?? '')).join(',')]);

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
					<div className="list-item" key={f.id} onClick={() => navigate(`/forum/${f.id}`)} style={{ position: 'relative' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<div style={{ width: 28, height: 28, borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--avatar-bg)' }}>
								{avatarUrlById[f.id] ? (
									<img src={avatarUrlById[f.id]} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
								) : null}
							</div>
							<div className="col">
							<div className="title">{f.title ?? (f.username ? `@${f.username}` : `Forum ${f.id}`)}</div>
							<div className="sub">{f.isPublic ? 'Public' : 'Private'}{f.username ? ` • @${f.username}` : ''}</div>
							</div>
						</div>
						<div className="spacer" />
						<button
							className="btn ghost"
							onClick={(e) => { e.stopPropagation(); setOpenMenuForId(openMenuForId === f.id ? null : f.id); }}
							title="More"
						>
							⋯
						</button>
						{openMenuForId === f.id && (
							<div
								onClick={(e) => e.stopPropagation()}
								style={{ position: 'absolute', top: 36, right: 8, zIndex: 5 }}
							>
								<div className="card" style={{ padding: 8, minWidth: 180 }}>
									<div className="col" style={{ gap: 6 }}>
										<button
											className="btn"
											style={{ background: 'transparent', color: 'var(--danger)' }}
											onClick={() => {
												const ok = confirm('Leave this forum? Your content will NOT be deleted from the forum.');
												if (!ok) return;
												removeForum(f.id);
												setOpenMenuForId(null);
												if (location.pathname.startsWith(`/forum/${f.id}`)) {
													navigate('/');
												}
											}}
										>
											Leave forum
										</button>
									</div>
								</div>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}