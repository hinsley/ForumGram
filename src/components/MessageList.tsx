import MessageItem, { DisplayMessage } from './MessageItem';

export default function MessageList({ messages, onEdit }: { messages: DisplayMessage[]; onEdit?: (msg: DisplayMessage) => void }) {
	return (
		<div className="forum-thread" style={{ height: '100%', overflow: 'auto' }}>
			{messages.map((m) => (
				<MessageItem key={m.id} msg={m} onEdit={onEdit} />
			))}
		</div>
	);
}