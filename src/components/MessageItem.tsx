import MarkdownView from '@lib/markdown';
import { format } from 'date-fns';

export interface DisplayMessage {
	id: number;
	from?: string;
	date: number; // epoch seconds
	text: string;
	threadId?: string | null;
	avatarUrl?: string;
	activityCount?: number;
}

export default function MessageItem({ msg }: { msg: DisplayMessage }) {
	return (
		<div className="forum-post">
			<div className="post-author">
				{msg.avatarUrl ? (
					<img className="avatar" src={msg.avatarUrl} alt="avatar" />
				) : (
					<div className="avatar placeholder" />
				)}
				<div className="author-name">{msg.from ?? 'unknown'}</div>
				{typeof msg.activityCount === 'number' && (
					<div className="author-activity">Activity: {msg.activityCount}</div>
				)}
			</div>
			<div className="post-body">
				<div className="post-meta">Posted {format(new Date(msg.date * 1000), 'yyyy-MM-dd HH:mm')}</div>
				<div className="post-content"><MarkdownView text={msg.text} /></div>
			</div>
		</div>
	);
}