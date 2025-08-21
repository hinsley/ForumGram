import featured from './featured-forums.json';

interface FeaturedForum { address: string; name: string; description: string; }

export default function FeaturedForums({ onSelect }: { onSelect: (address: string) => void }) {
	const items = (featured as FeaturedForum[]);
	return (
		<div className="col">
			<h4>Featured forums</h4>
			<div className="gallery">
				{items.map((f) => (
					<div key={f.address} className="chiclet" onClick={() => onSelect(f.address)}>
						<div className="row" style={{ alignItems: 'center' }}>
							<div className="forum-avatar placeholder" style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--muted)', fontSize: 12 }}>
								{(f.name || f.address || '').trim().slice(0, 1).toUpperCase()}
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

