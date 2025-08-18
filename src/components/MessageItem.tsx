import MarkdownView from '@lib/markdown';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';
import { getClient } from '@lib/telegram/client';

export interface DisplayMessage {
	id: number;
	from?: string;
	date: number; // epoch seconds
	text: string;
	threadId?: string | null;
	avatarUrl?: string;
	activityCount?: number;
	attachments?: DisplayAttachment[];
}

export interface DisplayAttachment {
	id: string;
	name: string;
	sizeBytes: number;
	isMedia: boolean;
	mimeType?: string;
	// Raw media object from Telegram TL (e.g., Api.MessageMediaDocument or Api.MessageMediaPhoto)
	media: any;
}

export default function MessageItem({ msg }: { msg: DisplayMessage }) {
	const dateObj = new Date(msg.date * 1000);
	const datePart = format(dateObj, 'd MMMM yyyy');
	const timePart = format(dateObj, 'h:mm a').replace(' ', '').toLowerCase();
	const postedAt = `${datePart} at ${timePart}`;

	function formatBytes(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes <= 0) return 'unknown size';
		const units = ['B', 'KB', 'MB', 'GB'];
		let i = 0;
		let n = bytes;
		while (n >= 1024 && i < units.length - 1) {
			n = n / 1024;
			i++;
		}
		const value = i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
		return `${value} ${units[i]}`;
	}

	async function onAttachmentClick(att: DisplayAttachment) {
		try {
			const client = await getClient();
			const data: any = await (client as any).downloadMedia(att.media);
			const blob = data instanceof Blob ? data : new Blob([data], { type: att.mimeType || 'application/octet-stream' });
			if (att.isMedia) {
				const url = URL.createObjectURL(blob);
				window.open(url, '_blank', 'noopener');
				// Revoke later to avoid breaking the opened tab; small timeout to allow navigation
				setTimeout(() => URL.revokeObjectURL(url), 30_000);
			} else {
				saveAs(blob, att.name);
			}
		} catch (e) {
			console.error('Failed to handle attachment', e);
		}
	}
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
				{msg.attachments && msg.attachments.length > 0 && (
					<div className="post-attachments" style={{ marginTop: 8 }}>
						<div style={{ fontWeight: 600, marginBottom: 4 }}>Attachments</div>
						<div className="list">
							{msg.attachments.map((att) => (
								<div
									key={att.id}
									className="list-item"
									onClick={() => onAttachmentClick(att)}
									style={{ cursor: 'pointer' }}
								>
									<div className="title">{att.name}</div>
									<div className="sub">{formatBytes(att.sizeBytes)}</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}