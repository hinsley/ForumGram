import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getForumTopics } from '@lib/telegram/client';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import TopicList, { TopicItem } from '@components/TopicList';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';

export default function ForumPage() {
	const { id } = useParams();
	const forumId = Number(id);
	const navigate = useNavigate();
	const initForums = useForumsStore((s) => s.initFromStorage);

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
				<div className="hr" />
				{isLoading ? <div>Loading...</div> : error ? <div style={{ color: 'var(--danger)' }}>{(error as any)?.message ?? 'Error'}</div> : (
					<TopicList items={data ?? []} onOpen={(topic) => navigate(`/forum/${forumId}/topic/${topic}`)} />
				)}
			</aside>
			<main className="main">
				<div className="card" style={{ padding: 12 }}>
					<h3>Forum {forumId}</h3>
					<p>Select a topic to view messages.</p>
				</div>
			</main>
		</div>
	);
}