import MarkdownView from '@lib/markdown';
import { format } from 'date-fns';

export interface DisplayMessage {
	id: number;
	from?: string;
	date: number; // epoch seconds
	text: string;
	threadId?: string | null;
}

export default function MessageItem({ msg }: { msg: DisplayMessage }) {
	return (
		<div className="message">
			<div className="meta">{msg.from ?? 'unknown'} • {format(new Date(msg.date * 1000), 'yyyy-MM-dd HH:mm')}</div>
			<div className="body"><MarkdownView text={msg.text} /></div>
		</div>
	);
}