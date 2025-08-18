import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { getTopicHistory, sendMessageToTopic, getClient, getForumTopics } from '@lib/telegram/client';
import { stripTagLine, extractThreadId, appendTagLine } from '@lib/threadTags';
import MessageList from '@components/MessageList';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { applyTelegramEntitiesToMarkdown, extractEntitiesFromMarkdown } from '@lib/telegram/entities';
import { db, getAvatarBlob, setAvatarBlob, setActivityCount } from '@lib/db';

export default function TopicPage() {
	const { id, topicId } = useParams();
	const forumId = Number(id);
	const topic = Number(topicId);
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [message, setMessage] = useState('');
	const [thread, setThread] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const initForums = useForumsStore((s) => s.initFromStorage);

	useEffect(() => { initForums(); }, [initForums]);

	const { data: messages = [], isLoading, error } = useQuery({
		queryKey: ['messages', forumId, topic],
		queryFn: async () => {
			const input = getInputPeerForForumId(forumId);
			const res: any = await getTopicHistory(input, topic, 0, 100);
			// Map users for author display
			const usersMap: Record<string, any> = {};
			(res.users ?? []).forEach((u: any) => { usersMap[String(u.id)] = u; });
			// Prepare avatar URLs from cache or network, but avoid duplicate downloads
			const client = await getClient();
			const avatarUrlMap: Record<string, string | undefined> = {};
			await Promise.all(Object.values(usersMap).map(async (u: any) => {
				const uid = Number(u.id);
				try {
					// Try cache first
					const cached = await getAvatarBlob(uid);
					if (cached) {
						avatarUrlMap[String(uid)] = URL.createObjectURL(cached);
						return;
					}
					if (u?.photo) {
						const data: any = await (client as any).downloadProfilePhoto(u);
						const blob = data instanceof Blob ? data : new Blob([data]);
						await setAvatarBlob(uid, blob);
						avatarUrlMap[String(uid)] = URL.createObjectURL(blob);
					}
				} catch {}
			}));
			const rawMsgs = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message');
			function deriveFileExtensionFromMime(mime?: string): string | undefined {
				if (!mime || typeof mime !== 'string' || !mime.includes('/')) return undefined;
				const subtype = mime.split('/')[1];
				if (!subtype) return undefined;
				if (subtype.includes('+')) return subtype.split('+').pop();
				return subtype;
			}
			function extractAttachmentsFromMessage(m: any) {
				const attachments: any[] = [];
				const media = m?.media;
				if (!media) return attachments;
				const cls = media.className ?? media._ ?? '';
				// Handle direct document
				if (cls === 'MessageMediaDocument' || cls === 'messageMediaDocument') {
					const doc = media.document ?? media.doc ?? undefined;
					if (doc) {
						const attrs = Array.isArray(doc.attributes) ? doc.attributes : [];
						let fileName: string | undefined;
						for (const a of attrs) {
							const an = a?.className ?? a?._ ?? '';
							if (an === 'DocumentAttributeFilename' || an === 'documentAttributeFilename') {
								fileName = a.fileName ?? a.file_name ?? undefined;
								break;
							}
						}
						const mime: string | undefined = doc.mimeType ?? doc.mime_type ?? undefined;
						const ext = fileName ? undefined : deriveFileExtensionFromMime(mime);
						const guessedName = fileName || `file_${String(doc.id ?? m.id)}${ext ? '.' + ext : ''}`;
						const size = Number((doc.size ?? doc.fileSize ?? 0) as number);
						const isMedia = typeof mime === 'string' && (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/'));
						attachments.push({
							id: String(doc.id ?? m.id),
							name: guessedName,
							sizeBytes: Number.isFinite(size) ? size : 0,
							isMedia,
							mimeType: mime,
							media,
						});
					}
				}
				// Handle direct photo
				if (cls === 'MessageMediaPhoto' || cls === 'messageMediaPhoto') {
					const photo = media.photo ?? undefined;
					let sizeBytes = 0;
					const sizes = photo?.sizes ?? [];
					for (const s of sizes) {
						if (typeof s?.size === 'number' && s.size > sizeBytes) sizeBytes = s.size;
						const b: any = (s as any)?.bytes;
						if (b && typeof b.length === 'number') sizeBytes = Math.max(sizeBytes, b.length);
					}
					attachments.push({
						id: String(photo?.id ?? m.id),
						name: `photo_${String(photo?.id ?? m.id)}.jpg`,
						sizeBytes: sizeBytes || 0,
						isMedia: true,
						mimeType: 'image/jpeg',
						media,
					});
				}
				// Handle webpages with document or photo
				if (cls === 'MessageMediaWebPage' || cls === 'messageMediaWebPage') {
					const wp = media.webpage;
					if (wp?.document) {
						const doc = wp.document;
						const attrs = Array.isArray(doc.attributes) ? doc.attributes : [];
						let fileName: string | undefined;
						for (const a of attrs) {
							const an = a?.className ?? a?._ ?? '';
							if (an === 'DocumentAttributeFilename' || an === 'documentAttributeFilename') {
								fileName = a.fileName ?? a.file_name ?? undefined;
								break;
							}
						}
						const mime: string | undefined = doc.mimeType ?? doc.mime_type ?? undefined;
						const ext = fileName ? undefined : deriveFileExtensionFromMime(mime);
						const guessedName = fileName || `file_${String(doc.id ?? m.id)}${ext ? '.' + ext : ''}`;
						const size = Number((doc.size ?? doc.fileSize ?? 0) as number);
						const isMedia = typeof mime === 'string' && (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/'));
						attachments.push({
							id: String(doc.id ?? m.id),
							name: guessedName,
							sizeBytes: Number.isFinite(size) ? size : 0,
							isMedia,
							mimeType: mime,
							media,
						});
					}
					if (wp?.photo) {
						const photo = wp.photo;
						let sizeBytes = 0;
						const sizes = photo?.sizes ?? [];
						for (const s of sizes) {
							if (typeof s?.size === 'number' && s.size > sizeBytes) sizeBytes = s.size;
						}
						attachments.push({
							id: String(photo?.id ?? m.id),
							name: `photo_${String(photo?.id ?? m.id)}.jpg`,
							sizeBytes: sizeBytes || 0,
							isMedia: true,
							mimeType: 'image/jpeg',
							media,
						});
					}
				}
				return attachments;
			}
			const mapped = rawMsgs.map((m: any) => {
				const fromUserId: number | undefined = m.fromId?.userId ? Number(m.fromId.userId) : undefined;
				const fromUser = fromUserId ? usersMap[String(fromUserId)] : undefined;
				const text: string = applyTelegramEntitiesToMarkdown(m.message ?? '', m.entities);
				const threadId = extractThreadId(text);
				return {
					id: Number(m.id),
					from: fromUser ? (fromUser.username ? '@' + fromUser.username : [fromUser.firstName, fromUser.lastName].filter(Boolean).join(' ')) : 'unknown',
					date: Number(m.date),
					text: stripTagLine(text),
					threadId,
					avatarUrl: fromUser ? avatarUrlMap[String(fromUser.id)] : undefined,
					fromUserId: fromUserId,
					attachments: extractAttachmentsFromMessage(m),
				};
			});
			// Persist to local DB for activity counting (idempotent via compound PK)
			try {
				await db.messages.bulkPut(mapped.map((m: any) => ({
					id: m.id,
					forumId,
					topicId: topic,
					fromId: m.fromUserId ?? 0,
					date: m.date,
					textMD: m.text,
					threadId: m.threadId,
				})));
			} catch {}
			// Compute activity counts for authors shown in this thread from DB
			const uniqueUserIds = Array.from(new Set(mapped.map((m: any) => m.fromUserId).filter(Boolean))) as number[];
			const counts = await Promise.all(uniqueUserIds.map((uid) => db.messages.where('[forumId+fromId]').equals([forumId, uid]).count()));
			const activityMap: Record<number, number> = {};
			uniqueUserIds.forEach((uid, i) => { activityMap[uid] = counts[i]; });
			// Update cache so other views can read quickly
			await Promise.all(uniqueUserIds.map((uid) => setActivityCount(forumId, uid, activityMap[uid] ?? 0)));
			const display = mapped.map((m: any) => ({
				id: m.id,
				from: m.from,
				date: m.date,
				text: m.text,
				threadId: m.threadId,
				avatarUrl: m.avatarUrl,
				activityCount: m.fromUserId ? activityMap[m.fromUserId] : undefined,
				attachments: m.attachments,
			}));
			// API returns newest-first; reverse so oldest is at top and newest at bottom
			display.reverse();
			return display as any[];
		},
		enabled: Number.isFinite(forumId) && Number.isFinite(topic),
		staleTime: 10_000,
	});

	// Load topics to resolve title for current topic
	const { data: topics = [] } = useQuery({
		queryKey: ['topics', forumId],
		queryFn: async () => {
			const input = getInputPeerForForumId(forumId);
			const res: any = await getForumTopics(input, 0, 0, 50);
			const topics = (res.topics ?? []).map((t: any) => ({
				id: Number(t.id),
				title: t.title ?? 'Untitled',
				iconEmoji: t.iconEmojiId ? String(t.iconEmojiId) : undefined,
				unreadCount: t.unreadCount,
				pinned: Boolean(t.pinned),
				lastActivity: t.lastMessageDate ? t.lastMessageDate * 1000 : undefined,
			}));
			return topics as any[];
		},
		enabled: Number.isFinite(forumId),
		staleTime: 60_000,
	});

	const topicMeta = useMemo(() => (topics as any[]).find((t: any) => t.id === topic), [topics, topic]);

	const subThreads = useMemo(() => {
		const bucket: Record<string, number> = {};
		for (const m of messages) {
			if (m.threadId) bucket[m.threadId] = (bucket[m.threadId] ?? 0) + 1;
		}
		return Object.entries(bucket).map(([id, count]) => ({ id, count }));
	}, [messages]);

	async function onSend() {
		try {
			setStatus('Sending...');
			const input = getInputPeerForForumId(forumId);
			const withTag = thread ? appendTagLine(message, thread, 'sig_placeholder') : message;
			const { plainText, entities } = extractEntitiesFromMarkdown(withTag);
			await sendMessageToTopic(input, topic, plainText, entities);
			setMessage('');
			setStatus('Sent');
			setTimeout(() => setStatus(null), 1500);
			qc.invalidateQueries({ queryKey: ['messages', forumId, topic] });
		} catch (e: any) {
			setStatus(e?.message ?? 'Failed');
		}
	}

	return (
		<div className="content">
			<aside className="sidebar">
				<div className="col">
					<ForumList />
					<div className="hr" />
					<h4>Sub-threads</h4>
					<div className="list">
						<div className="list-item" onClick={() => setThread(null)}>
							<div className="title">All messages</div>
						</div>
						{subThreads.map((t) => (
							<div className="list-item" key={t.id} onClick={() => setThread(t.id)}>
								<div className="title">{t.id}</div>
								<div className="sub">{t.count} messages</div>
							</div>
						))}
					</div>
				</div>
			</aside>
			<main className="main">
				<div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
					<div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
						<div className="row" style={{ alignItems: 'center' }}>
							<button className="btn ghost" onClick={() => navigate(`/forum/${forumId}`)}>Back</button>
							<h3 style={{ margin: 0 }}>{topicMeta ? `${topicMeta.iconEmoji ? `${topicMeta.iconEmoji} ` : ''}${topicMeta.title}` : 'Board'}</h3>
							<div className="spacer" />
						</div>
					</div>
					<div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
						{isLoading ? <div style={{ padding: 12 }}>Loading...</div> : error ? <div style={{ padding: 12, color: 'var(--danger)' }}>{(error as any)?.message ?? 'Error'}</div> : (
							<MessageList messages={messages} />
						)}
					</div>
					<div className="composer">
						<textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={thread ? `Reply in #${thread}` : 'Write a reply...'} />
						<button className="btn primary" onClick={onSend} disabled={!message.trim()}>Post Reply</button>
					</div>
				</div>
				{status && <div style={{ padding: 8, color: 'var(--muted)' }}>{status}</div>}
			</main>
		</div>
	);
}