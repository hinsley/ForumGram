import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { getTopicHistory, sendMessageToTopic, getClient } from '@lib/telegram/client';
import { stripTagLine, extractThreadId, appendTagLine } from '@lib/threadTags';
import MessageList from '@components/MessageList';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { applyTelegramEntitiesToMarkdown, extractEntitiesFromMarkdown } from '@lib/telegram/entities';
import { getAvatarBlob, setAvatarBlob } from '@lib/db';

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
			const msgs = (res.messages ?? []).filter((m: any) => m.className === 'Message' || m._ === 'message').map((m: any) => {
				const fromUser = m.fromId?.userId ? usersMap[String(m.fromId.userId)] : undefined;
				const text: string = applyTelegramEntitiesToMarkdown(m.message ?? '', m.entities);
				const threadId = extractThreadId(text);
				return {
					id: Number(m.id),
					from: fromUser ? (fromUser.username ? '@' + fromUser.username : [fromUser.firstName, fromUser.lastName].filter(Boolean).join(' ')) : 'unknown',
					date: Number(m.date),
					text: stripTagLine(text),
					threadId,
					avatarUrl: fromUser ? avatarUrlMap[String(fromUser.id)] : undefined,
				};
			});
			// API returns newest-first; reverse so oldest is at top and newest at bottom
			msgs.reverse();
			return msgs as any[];
		},
		enabled: Number.isFinite(forumId) && Number.isFinite(topic),
		staleTime: 10_000,
	});

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
							<h3 style={{ margin: 0 }}>Board {topic}</h3>
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