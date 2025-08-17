import { Virtuoso } from 'react-virtuoso';
import MessageItem, { DisplayMessage } from './MessageItem';

export default function MessageList({ messages }: { messages: DisplayMessage[] }) {
	return (
		<Virtuoso style={{ height: '100%' }} totalCount={messages.length} itemContent={(index) => (
			<MessageItem msg={messages[index]} />
		)} />
	);
}