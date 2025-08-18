import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getForumTopics } from '@lib/telegram/client';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { TopicItem } from '@components/TopicList';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';

export default function ForumPage() {
	const { id } = useParams();
	const forumId = Number(id);
	const navigate = useNavigate();
	const initForums = useForumsStore((s) => s.initFromStorage);
	const forumMeta = useForumsStore((s) => (Number.isFinite(forumId) ? s.forums[forumId] : undefined));

	useEffect(() => { initForums(); }, [initForums]);
	const { data, isLoading, error } = useQuery({
		queryKey: ['topics', forumId],
		queryFn: async () => {
			const input = getInputPeerForForumId(forumId);
			const res: any = await getForumTopics(input, 0, 0, 50);
			const topics: TopicItem[] = (res.topics ?? []).map((t: any) => ({
				id: Number(t.id),
				title: t.title ?? 'Untitled',
				iconEmoji: t.iconEmojiId ? String(t.iconEmojiId) : undefined,
				unreadCount: t.unreadCount,
				pinned: Boolean(t.pinned),
				lastActivity: t.lastMessageDate ? t.lastMessageDate * 1000 : undefined,
			}));
			return topics;
		},
		enabled: Number.isFinite(forumId),
	});

	return (
		<div className="content">
			<aside className="sidebar">
				<ForumList />
			</aside>
			<main className="main">
				<div className="card" style={{ padding: 12 }}>
					<h3>{forumMeta?.title ?? (forumMeta?.username ? `@${forumMeta.username}` : `Forum ${forumId}`)}</h3>
					<div className="col">
						<h4 style={{ marginTop: 0 }}>Boards</h4>
						{isLoading ? (
							<div>Loading...</div>
						) : error ? (
							<div style={{ color: 'var(--danger)' }}>{(error as any)?.message ?? 'Error'}</div>
						) : (
							<div className="gallery">
								{(data ?? []).map((t) => (
									<div key={t.id} className="chiclet" onClick={() => navigate(`/forum/${forumId}/topic/${t.id}`)}>
										<div className="title">{t.iconEmoji ? `${t.iconEmoji} ` : ''}{t.title}</div>
										<div className="sub">{t.unreadCount ? `${t.unreadCount} unread • ` : ''}{t.lastActivity ? formatTimestamp(t.lastActivity) : '—'}</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}

function formatTimestamp(msSinceEpoch: number): string {
	const d = new Date(msSinceEpoch);
	const day = d.getDate();
	const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
	const datePart = `${day} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
	let hours = d.getHours();
	const minutes = d.getMinutes().toString().padStart(2, '0');
	const ampm = hours >= 12 ? 'pm' : 'am';
	hours = hours % 12;
	if (hours === 0) hours = 12;
	const timePart = `${hours}:${minutes}${ampm}`;
	return `${datePart} at ${timePart}`;
}