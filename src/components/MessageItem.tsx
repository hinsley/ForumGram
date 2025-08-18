import MarkdownView from '@lib/markdown';
import { format } from 'date-fns';

export interface DisplayMessage {
	id: number;
	from?: string;
	date: number; // epoch seconds
	text: string;
	threadId?: string | null;
}

export default function MessageItem({ msg, index }: { msg: DisplayMessage; index?: number }) {
	return (
		<div className="forum-post">
			<div className="post-author">
				<div className="author-name">{msg.from ?? 'unknown'}</div>
				<div className="post-index">#{(index ?? 0) + 1}</div>
			</div>
			<div className="post-body">
				<div className="post-meta">Posted {format(new Date(msg.date * 1000), 'yyyy-MM-dd HH:mm')}</div>
				<div className="post-content"><MarkdownView text={msg.text} /></div>
			</div>
		</div>
	);
}