import { Virtuoso } from 'react-virtuoso';
import MessageItem, { DisplayMessage } from './MessageItem';

export default function MessageList({ messages }: { messages: DisplayMessage[] }) {
	return (
		<Virtuoso style={{ height: '100%' }} totalCount={messages.length} initialTopMostItemIndex={messages.length - 1} itemContent={(index) => (
			<MessageItem msg={messages[index]} />
		)} />
	);
}