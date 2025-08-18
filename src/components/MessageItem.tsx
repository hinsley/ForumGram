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
	const dateObj = new Date(msg.date * 1000);
	const datePart = format(dateObj, 'd MMMM yyyy');
	const timePart = format(dateObj, 'h:mm a').replace(' ', '').toLowerCase();
	const postedAt = `${datePart} at ${timePart}`;
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
				<div className="post-meta">Posted {postedAt}</div>
				<div className="post-content"><MarkdownView text={msg.text} /></div>
			</div>
		</div>
	);
}