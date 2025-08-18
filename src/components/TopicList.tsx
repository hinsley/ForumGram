export interface TopicItem { id: number; title: string; unreadCount?: number; lastActivity?: number; pinned?: boolean; iconEmoji?: string; }

export default function TopicList({ items, onOpen }: { items: TopicItem[]; onOpen: (id: number) => void }) {
	return (
		<div className="list">
			{items.map((t) => (
				<div className="list-item" key={t.id} onClick={() => onOpen(t.id)}>
					<div className="col">
						<div className="title">{t.iconEmoji ? `${t.iconEmoji} ` : ''}{t.title}</div>
						<div className="sub">{t.unreadCount ? `${t.unreadCount} unread • ` : ''}{t.lastActivity ? formatTimestamp(t.lastActivity) : '—'}</div>
					</div>
				</div>
			))}
		</div>
	);
}

function formatTimestamp(msSinceEpoch: number): string {
	const d = new Date(msSinceEpoch);
	const day = d.getDate();
	const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
	const datePart = `${day} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
	let hours = d.getHours();
	const minutes = d.getMinutes().toString().padStart(2, '0');
	const ampm = hours >= 12 ? 'pm' : 'am';
	hours = hours % 12;
	if (hours === 0) hours = 12;
	const timePart = `${hours}:${minutes}${ampm}`;
	return `${datePart} at ${timePart}`;
}