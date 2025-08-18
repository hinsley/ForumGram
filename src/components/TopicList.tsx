export interface TopicItem { id: number; title: string; unreadCount?: number; lastActivity?: number; pinned?: boolean; iconEmoji?: string; }

export default function TopicList({ items, onOpen }: { items: TopicItem[]; onOpen: (id: number) => void }) {
	return (
		<div className="list">
			{items.map((t) => (
				<div className="list-item" key={t.id} onClick={() => onOpen(t.id)}>
					<div className="col">
						<div className="title">{t.iconEmoji ? `${t.iconEmoji} ` : ''}{t.title}</div>
						{(t.unreadCount || t.lastActivity) && (
							<div className="sub">
								{t.unreadCount ? `${t.unreadCount} unread${t.lastActivity ? ' • ' : ''}` : ''}
								{t.lastActivity ? new Date(t.lastActivity).toLocaleString() : ''}
							</div>
						)}
					</div>
				</div>
			))}
		</div>
	);
}