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
						<div className="title">{f.name}</div>
						<div className="sub">{f.address}</div>
						<p style={{ margin: 0 }}>{f.description}</p>
					</div>
				))}
			</div>
		</div>
	);
}

