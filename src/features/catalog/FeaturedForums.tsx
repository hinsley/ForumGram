import { useForumAvatarUrl } from '@lib/resourceCache';
import { useForumsStore } from '@state/forums';
import featured from './featured-forums.json';

interface FeaturedForum { address: string; name: string; description: string; }
function FeaturedAvatar({ id, name }: { id?: number; name: string }) {
	const url = useForumAvatarUrl(id);
	return url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 'bold' }}>{name.charAt(0).toUpperCase()}</div>;
}

export default function FeaturedForums({ onSelect }: { onSelect: (address: string) => void }) {
	const items = (featured as FeaturedForum[]);
	const forums = useForumsStore((s) => s.forums);

	return (
		<div className="col">
			<div className="section-heading"><div><p className="eyebrow">EXPLORE</p><h2>Featured communities</h2></div><span className="muted">A place to start</span></div>
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
								<FeaturedAvatar id={Object.values(forums).find(forum => forum.username === f.address.slice(1))?.id} name={f.name} />
							</div>
							<div className="title">{f.name}</div>
						</div>
						<div className="sub">{f.address}</div>
						<p style={{ margin: 0 }}>{f.description}</p>
						<span className="featured-action">Open community <span aria-hidden="true">↗</span></span>
					</button>
				))}
			</div>
		</div>
	);
}

