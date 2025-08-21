import featured from './featured-forums.json';
import ForumAvatar from '@components/ForumAvatar';

interface FeaturedForum { address: string; name: string; description: string; }

export default function FeaturedForums({ onSelect }: { onSelect: (address: string) => void }) {
	const items = (featured as FeaturedForum[]);
	return (
		<div className="col">
			<h4>Featured forums</h4>
			<div className="gallery">
				{items.map((f) => (
					<div key={f.address} className="chiclet" onClick={() => onSelect(f.address)} style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 10, alignItems: 'center' }}>
						<ForumAvatar username={f.address} size={36} title={f.name} />
						<div className="col">
							<div className="title">{f.name}</div>
							<div className="sub">{f.address}</div>
							<p style={{ margin: 0 }}>{f.description}</p>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

