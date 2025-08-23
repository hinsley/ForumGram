import { useState, useEffect } from 'react';
import { getForumAvatarBlob } from '@lib/db';
import { downloadForumAvatar } from '@lib/telegram/client';
import { useForumsStore } from '@state/forums';
import featured from './featured-forums.json';

interface FeaturedForum { address: string; name: string; description: string; }

export default function FeaturedForums({ onSelect }: { onSelect: (address: string) => void }) {
	const items = (featured as FeaturedForum[]);
	const forums = useForumsStore((s) => s.forums);
	const [forumAvatars, setForumAvatars] = useState<Record<string, string | null>>({});

	// Load avatars for featured forums that have been visited
	useEffect(() => {
		const loadAvatars = async () => {
			const newAvatars: Record<string, string | null> = {};

			for (const item of items) {
				const forumId = Object.values(forums).find(f => f.username === item.address.slice(1))?.id;

				if (forumId) {
					try {
						// Check if we already have this avatar cached
						let cached = await getForumAvatarBlob(forumId);
						if (cached) {
							newAvatars[item.address] = URL.createObjectURL(cached);
						} else {
							// Try to download the avatar from Telegram
							const downloaded = await downloadForumAvatar(forumId);
							if (downloaded) {
								newAvatars[item.address] = URL.createObjectURL(downloaded);
							} else {
								newAvatars[item.address] = null;
							}
						}
					} catch (e) {
						console.error(`Failed to load avatar for featured forum ${item.address}:`, e);
						newAvatars[item.address] = null;
					}
				} else {
					newAvatars[item.address] = null;
				}
			}

			setForumAvatars(newAvatars);
		};

		loadAvatars();
	}, [items, forums]);

	// Cleanup Object URLs when component unmounts
	useEffect(() => {
		return () => {
			Object.values(forumAvatars).forEach(url => {
				if (url) {
					URL.revokeObjectURL(url);
				}
			});
		};
	}, [forumAvatars]);

	return (
		<div className="col">
			<h4>Featured forums</h4>
			<div className="gallery">
				{items.map((f) => (
					<div key={f.address} className="chiclet" onClick={() => onSelect(f.address)}>
						<div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 8 }}>
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
								{forumAvatars[f.address] ? (
									<img
										src={forumAvatars[f.address]!}
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
										{f.name.charAt(0).toUpperCase()}
									</div>
								)}
							</div>
							<div className="title">{f.name}</div>
						</div>
						<div className="sub">{f.address}</div>
						<p style={{ margin: 0 }}>{f.description}</p>
					</div>
				))}
			</div>
		</div>
	);
}

