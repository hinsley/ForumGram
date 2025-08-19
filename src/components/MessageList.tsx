import MessageItem, { DisplayMessage } from './MessageItem';

export default function MessageList({ messages, currentUserId, onEditPost, onDeletePost }: { messages: DisplayMessage[]; currentUserId?: number; onEditPost?: (m: DisplayMessage) => void; onDeletePost?: (m: DisplayMessage) => void; }) {
	return (
		<div className="forum-thread" style={{ height: '100%', overflow: 'auto' }}>
			{messages.map((m) => (
				<MessageItem
					key={m.id}
					msg={m}
					canEdit={Boolean(currentUserId && m.authorUserId === currentUserId)}
					canDelete={Boolean(currentUserId && m.authorUserId === currentUserId)}
					onEdit={onEditPost}
					onDelete={onDeletePost}
				/>
			))}
		</div>
	);
}