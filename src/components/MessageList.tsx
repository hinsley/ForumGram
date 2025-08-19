import MessageItem, { DisplayMessage } from './MessageItem';

export default function MessageList({ messages, currentUserId, onEdit, onDelete, onEditPost, onDeletePost }: { messages: DisplayMessage[]; currentUserId?: number; onEdit?: (m: DisplayMessage) => void; onDelete?: (m: DisplayMessage) => void; onEditPost?: (m: DisplayMessage) => void; onDeletePost?: (m: DisplayMessage) => void; }) {
	return (
		<div className="forum-thread" style={{ height: '100%', overflow: 'auto' }}>
			{messages.map((m) => {
				const canByAuthor = Boolean(currentUserId && m.authorUserId === currentUserId);
				const canEdit = canByAuthor || Boolean((m as any).canEdit);
				const canDelete = canByAuthor || Boolean((m as any).canDelete);
				const handleEdit = onEditPost ?? onEdit;
				const handleDelete = onDeletePost ?? onDelete;

				return (
					<MessageItem
						key={m.id}
						msg={m}
						canEdit={canEdit}
						canDelete={canDelete}
						onEdit={handleEdit}
						onDelete={handleDelete}
					/>
				);
			})}
		</div>
	);
}
