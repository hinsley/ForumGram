import { memo } from 'react';
import MessageItem, { DisplayMessage } from './MessageItem';

const MessageList = memo(function MessageList({ messages, currentUserId, onEdit, onDelete, onEditPost, onDeletePost }: { messages: DisplayMessage[]; currentUserId?: number; onEdit?: (m: DisplayMessage) => void; onDelete?: (m: DisplayMessage) => void; onEditPost?: (m: DisplayMessage) => void; onDeletePost?: (m: DisplayMessage) => void; }) {
	return (
		<div className="forum-thread" style={{ height: '100%', overflow: 'auto' }}>
			{messages.map((m) => {
				const canByAuthor = currentUserId !== undefined && m.authorUserId !== undefined && currentUserId === m.authorUserId;
				const canEdit = canByAuthor || Boolean(m.canEdit);
				const canDelete = canByAuthor || Boolean(m.canDelete);
				const handleEdit = onEditPost ?? onEdit;
				const handleDelete = onDeletePost ?? onDelete;

				return (
					<MessageItem
						key={`${m.forumId}:${m.cardId ?? m.id}`}
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
});

export default MessageList;
