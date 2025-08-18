import MessageItem, { DisplayMessage } from './MessageItem';

export default function MessageList({ messages }: { messages: DisplayMessage[] }) {
	return (
		<div className="forum-thread" style={{ height: '100%', overflow: 'auto' }}>
			{messages.map((m) => (
				<MessageItem key={m.id} msg={m} />
			))}
		</div>
	);
}