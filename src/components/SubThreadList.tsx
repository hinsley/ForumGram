export interface SubThreadItem { id: string; title?: string; count: number; lastActivity?: number; }

export default function SubThreadList({ items, selected, onSelect }: { items: SubThreadItem[]; selected: string | null; onSelect: (id: string | null) => void }) {
	return (
		<div className="list">
			<div className="list-item" onClick={() => onSelect(null)}>
				<div className="title">All messages</div>
			</div>
			{items.map((it) => (
				<div key={it.id} className="list-item" onClick={() => onSelect(it.id)}>
					<div className="col">
						<div className="title">{it.title ?? it.id}</div>
						<div className="sub">{it.count} messages</div>
					</div>
				</div>
			))}
		</div>
	);
}