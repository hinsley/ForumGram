import MarkdownView from '@lib/markdown';
import { format } from 'date-fns';
import { getClient } from '@lib/telegram/client';
import { useEffect, useState } from 'react';

interface AttachmentMeta {
	name: string;
	sizeBytes?: number;
	mimeType?: string;
	isMedia: boolean;
	media: any;
}

export interface DisplayMessage {
	id: number;
	from?: string;
	date: number; // epoch seconds
	text: string;
	threadId?: string | null;
	avatarUrl?: string;
	activityCount?: number;
	attachments?: AttachmentMeta[];
}

export default function MessageItem({ msg }: { msg: DisplayMessage }) {
	const dateObj = new Date(msg.date * 1000);
	const datePart = format(dateObj, 'd MMMM yyyy');
	const timePart = format(dateObj, 'h:mm a').replace(' ', '').toLowerCase();
	const postedAt = `${datePart} at ${timePart}`;

	function formatBytes(size?: number): string {
		if (!size || size <= 0) return '';
		const units = ['B', 'KB', 'MB', 'GB'];
		let idx = 0;
		let val = size;
		while (val >= 1024 && idx < units.length - 1) {
			val = val / 1024;
			idx++;
		}
		const num = idx === 0 ? Math.round(val) : Math.round(val * 10) / 10;
		return `${num} ${units[idx]}`;
	}

	const [thumbUrls, setThumbUrls] = useState<(string | undefined)[]>([]);
	useEffect(() => {
		let canceled = false;
		const cleanups: Array<() => void> = [];
		(async () => {
			try {
				if (!Array.isArray(msg.attachments) || msg.attachments.length === 0) {
					setThumbUrls([]);
					return;
				}
				const client = await getClient();
				const urls: (string | undefined)[] = [];
				for (let i = 0; i < msg.attachments.length; i++) {
					const att = msg.attachments[i];
					if (att && att.isMedia && (att.mimeType?.startsWith('image/') || att.mimeType?.startsWith('video/'))) {
						try {
							const sizes = (att as any)?.media?.photo?.sizes || (att as any)?.media?.document?.thumbs;
							if (!Array.isArray(sizes) || sizes.length === 0) { urls[i] = undefined; continue; }
							const largestIdx = sizes.length - 1;
							const thumbParam = largestIdx; // use index for largest thumb
							const data: any = await (client as any).downloadMedia(att.media, { thumb: thumbParam });
							if (!data) { urls[i] = undefined; continue; }
							const blob = data instanceof Blob ? data : new Blob([data], { type: 'image/jpeg' });
							const url = URL.createObjectURL(blob);
							urls[i] = url;
							cleanups.push(() => URL.revokeObjectURL(url));
						} catch {}
					} else {
						urls[i] = undefined;
					}
				}
				if (!canceled) setThumbUrls(urls);
			} catch {}
		})();
		return () => {
			canceled = true;
			for (const fn of cleanups) { try { fn(); } catch {} }
		};
	}, [msg.attachments]);

	async function onAttachmentClick(att: AttachmentMeta) {
		try {
			const client = await getClient();
			const data: any = await (client as any).downloadMedia(att.media);
			const blob = data instanceof Blob ? data : new Blob([data], { type: att.mimeType || 'application/octet-stream' });
			const url = URL.createObjectURL(blob);
			if (att.isMedia) {
				window.open(url, '_blank');
			} else {
				const a = document.createElement('a');
				a.href = url;
				a.download = att.name || 'download';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				setTimeout(() => URL.revokeObjectURL(url), 4000);
			}
		} catch {}
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
				{Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
					<div className="post-attachments" style={{ marginTop: 8 }}>
						<div style={{ fontWeight: 600, marginBottom: 4 }}>Attachments</div>
						<div className="list">
							{msg.attachments.map((att, idx) => (
								<div key={idx} className="list-item" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onAttachmentClick(att)}>
									{thumbUrls[idx] && (
										<img src={thumbUrls[idx]} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />
									)}
									<div>
										<div className="title">{att.name}</div>
										<div className="sub">{formatBytes(att.sizeBytes)}</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}