import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { getForumTopics } from '@lib/telegram/client';
import type { TopicItem } from '@components/TopicList';

const TopicPage = () => {
	const { id, topicId } = useParams();
	const forumId = Number(id);
	const topic = Number(topicId);
	const navigate = useNavigate();
	const qc = useQueryClient();

	// Resolve current topic metadata from cache or fetch topics if missing
	const cachedTopics = qc.getQueryData<TopicItem[] | undefined>(['topics', forumId]);

	const { data: topicsData } = useQuery({
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
		enabled: Number.isFinite(forumId) && !(cachedTopics && cachedTopics.length > 0),
		staleTime: 60_000,
	});

	const activeTopic = useMemo(() => {
		const list = (cachedTopics && cachedTopics.length > 0) ? cachedTopics : (topicsData ?? []);
		return list.find((t) => t.id === topic);
	}, [cachedTopics, topicsData, topic]);

	if (!forumId || !topic) {
		return <div>Forum or topic not found.</div>;
	}

	if (!activeTopic) {
		return <div>Loading...</div>;
	}

	return (
		<div className="forum-page">
			<button className="btn ghost" onClick={() => navigate(`/forum/${forumId}`)}>Back</button>
			<h3 style={{ margin: 0 }}>{activeTopic ? `${activeTopic.iconEmoji ? activeTopic.iconEmoji + ' ' : ''}${activeTopic.title}` : 'Board'}</h3>
			<div className="spacer" />
			{/* The rest of the topic page content would go here */}
		</div>
	);
};

export default TopicPage;