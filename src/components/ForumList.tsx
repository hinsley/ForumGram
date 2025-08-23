import { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForumsStore } from '@state/forums';
import { getForumAvatarBlob, setForumAvatarBlob } from '@lib/db';
import { downloadForumAvatar } from '@lib/telegram/client';

export default function ForumList() {
	const forums = useForumsStore((s) => s.forums);
	const removeForum = useForumsStore((s) => s.removeForum);
	const navigate = useNavigate();
	const location = useLocation();
	const [openMenuForId, setOpenMenuForId] = useState<number | null>(null);
	const [forumAvatars, setForumAvatars] = useState<Record<number, string | null>>({});
	const [loadedForumIds, setLoadedForumIds] = useState<Set<number>>(new Set());

	// Load forum avatars only for new forums
	useEffect(() => {
		const loadAvatars = async () => {
			const forumIds = Object.keys(forums).map(id => Number(id));
			const newAvatars: Record<number, string | null> = { ...forumAvatars };
			let hasChanges = false;

			for (const forumId of forumIds) {
				// Skip if already loaded
				if (loadedForumIds.has(forumId)) {
					continue;
				}

				try {
					// Check if we already have this avatar cached
					let cached = await getForumAvatarBlob(forumId);
					if (cached) {
						newAvatars[forumId] = URL.createObjectURL(cached);
						hasChanges = true;
					} else {
						// Try to download the avatar from Telegram
						const downloaded = await downloadForumAvatar(forumId);
						if (downloaded) {
							await setForumAvatarBlob(forumId, downloaded);
							newAvatars[forumId] = URL.createObjectURL(downloaded);
							hasChanges = true;
						} else {
							newAvatars[forumId] = null;
							hasChanges = true;
						}
					}
				} catch (e) {
					console.error(`Failed to load avatar for forum ${forumId}:`, e);
					newAvatars[forumId] = null;
					hasChanges = true;
				}
			}

			if (hasChanges) {
				setForumAvatars(newAvatars);
				setLoadedForumIds(new Set([...loadedForumIds, ...forumIds]));
			}
		};

		if (Object.keys(forums).length > 0) {
			loadAvatars();
		}
	}, [forums, loadedForumIds]);

	// Cleanup Object URLs when component unmounts
	useEffect(() => {
		return () => {
			Object.values(forumAvatars).forEach(url => {
				if (url) {
					URL.revokeObjectURL(url);
				}
			});
		};
	}, []);

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
					<div className="list-item" key={f.id} onClick={() => navigate(`/forum/${f.id}`)} style={{ position: 'relative' }}>
						<div className="row" style={{ alignItems: 'center', gap: 12 }}>
							<div style={{
								width: 32,
								height: 32,
								borderRadius: 16,
								backgroundColor: 'var(--border)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								flexShrink: 0,
								overflow: 'hidden'
							}}>
								{forumAvatars[f.id] ? (
									<img
										src={forumAvatars[f.id]!}
										alt=""
										style={{
											width: '100%',
											height: '100%',
											objectFit: 'cover'
										}}
									/>
								) : (
									<div style={{
										fontSize: 16,
										color: 'var(--muted)',
										fontWeight: 'bold'
									}}>
										{f.title ? f.title.charAt(0).toUpperCase() : '#'}
									</div>
								)}
							</div>
							<div className="col">
								<div className="title">{f.title ?? (f.username ? `@${f.username}` : `Forum ${f.id}`)}</div>
								<div className="sub" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
									<div>{f.isPublic ? 'Public' : 'Private'}</div>
									{f.username && <div style={{ fontSize: '11px' }}>@{f.username}</div>}
								</div>
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