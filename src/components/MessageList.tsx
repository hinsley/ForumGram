import MessageItem, { DisplayMessage } from './MessageItem';

export default function MessageList({ messages, currentUserId, onEdit, onDelete, onEditPost, onDeletePost }: { messages: DisplayMessage[]; currentUserId?: number; onEdit?: (m: DisplayMessage) => void; onDelete?: (m: DisplayMessage) => void; onEditPost?: (m: DisplayMessage) => void; onDeletePost?: (m: DisplayMessage) => void; }) {
	return (
		<div className="forum-thread" style={{ height: '100%', overflow: 'auto' }}>
			{messages.map((m) => {
				function normalizeId(val: any): number | undefined {
					if (val === null || val === undefined) return undefined;
					if (typeof val === 'number' && Number.isFinite(val)) return val;
					if (typeof val === 'bigint') return Number(val);
					if (typeof val === 'string' && /^\d+$/.test(val)) return Number(val);
					if (val && typeof val.toJSNumber === 'function') return val.toJSNumber();
					if (val && typeof val.toNumber === 'function') return val.toNumber();
					if (val && typeof val.value === 'number') return val.value;
					return undefined;
				}

				const currentId = normalizeId(currentUserId as any);
				const authorId = normalizeId((m as any).authorUserId);
				const canByAuthor = currentId !== undefined && authorId !== undefined && currentId === authorId;
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
