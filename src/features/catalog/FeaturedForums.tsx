import { useMemo } from 'react';
import { useForumAvatarByUsername, useForumAvatarUrl } from '@lib/resourceCache';
import { useForumsStore } from '@state/forums';
import featured from './featured-forums.json';

interface FeaturedForum { address: string; name: string; description: string; }
function FeaturedAvatar({ address, name }: { address: string; name: string }) {
	const forums = useForumsStore((s) => s.forums);
	const joined = useMemo(() => Object.values(forums).find((forum): forum is { id: number; username?: string } => Boolean(forum && forum.username === address.slice(1)))?.id, [forums, address]);
	const joinedUrl = useForumAvatarUrl(joined);
	const directoryUrl = useForumAvatarByUsername(joined === undefined ? address : undefined);
	const url = joinedUrl ?? directoryUrl;
	return url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 'bold' }}>{name.charAt(0).toUpperCase()}</div>;
}

export default function FeaturedForums({ onSelect }: { onSelect: (address: string) => void }) {
	const items = (featured as FeaturedForum[]);

	return (
		<div className="col">
			<div className="section-heading"><h2>Featured</h2></div>
			<div className="gallery">
				{items.map((f) => (
					<button type="button" key={f.address} className="chiclet featured-card" onClick={() => onSelect(f.address)}>
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
								<FeaturedAvatar address={f.address} name={f.name} />
							</div>
							<div className="title">{f.name}</div>
						</div>
						<p style={{ margin: 0 }}>{f.description}</p>
					</button>
				))}
			</div>
		</div>
	);
}

