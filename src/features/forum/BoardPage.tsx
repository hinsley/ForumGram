import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { useQuery } from '@tanstack/react-query';
import { ThreadMeta, PostCard, searchThreadCards, searchPostCards, composeThreadCard, composePostCard, generateIdHash } from '@lib/protocol';
import { deleteMessages, sendPlainMessage } from '@lib/telegram/client';
import MessageList from '@components/MessageList';

export default function BoardPage() {
    const { id, boardId } = useParams();
    const forumId = Number(id);
    const navigate = useNavigate();
    const initForums = useForumsStore((s) => s.initFromStorage);

    useEffect(() => { initForums(); }, [initForums]);

    const { data: threads = [], isLoading: loadingThreads, error: threadsError, refetch: refetchThreads } = useQuery({
        queryKey: ['threads', forumId, boardId],
        queryFn: async () => {
            const input = getInputPeerForForumId(forumId);
            const items = await searchThreadCards(input, String(boardId));
            items.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
            return items as ThreadMeta[];
        },
        enabled: Number.isFinite(forumId) && Boolean(boardId),
        staleTime: 10_000,
    });

    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const activeThreadId = selectedThreadId; // do not auto-select any thread
    const activeThread = (threads || []).find((t) => t.id === activeThreadId) || null;

    const { data: posts = [], isLoading: loadingPosts, error: postsError, refetch: refetchPosts } = useQuery({
        queryKey: ['posts', forumId, boardId, activeThreadId],
        queryFn: async () => {
            if (!activeThreadId) return [] as PostCard[];
            const input = getInputPeerForForumId(forumId);
            const items = await searchPostCards(input, String(activeThreadId));
            const mapped = items.map((p) => ({
                id: p.messageId,
                from: p.fromUserId ? `user:${p.fromUserId}` : 'unknown',
                date: p.date ?? 0,
                text: p.content,
                threadId: p.parentThreadId,
                avatarUrl: undefined,
                attachments: (p as any).media ? [{ name: 'attachment', isMedia: true, media: (p as any).media }] : [],
            }));
            mapped.sort((a, b) => a.date - b.date);
            return mapped as any[];
        },
        enabled: Number.isFinite(forumId) && Boolean(activeThreadId),
        staleTime: 5_000,
    });

    async function onCreateThread() {
        try {
            const title = prompt('Thread title?')?.trim();
            if (!title) return;
            const idHash = generateIdHash(16);
            const text = composeThreadCard(idHash, String(boardId), { title });
            const input = getInputPeerForForumId(forumId);
            await sendPlainMessage(input, text);
            await refetchThreads();
        } catch (e: any) {
            alert(e?.message ?? 'Failed to create thread');
        }
    }

    async function onDeleteThread(t: ThreadMeta) {
        try {
            if (!confirm(`Delete thread "${t.title}"? Posts will remain as zombie messages.`)) return;
            const input = getInputPeerForForumId(forumId);
            await deleteMessages(input, [t.messageId]);
            await refetchThreads();
        } catch (e: any) {
            alert(e?.message ?? 'Failed to delete thread');
        }
    }

    const [composerText, setComposerText] = useState('');
    async function onSendPost() {
        try {
            if (!activeThreadId) return;
            const idHash = generateIdHash(16);
            const text = composePostCard(idHash, activeThreadId, { content: composerText });
            const input = getInputPeerForForumId(forumId);
            await sendPlainMessage(input, text);
            setComposerText('');
            await refetchPosts();
        } catch (e: any) {
            alert(e?.message ?? 'Failed to send post');
        }
    }

    return (
        <div className="content">
            <aside className="sidebar">
                <div className="col">
                    <ForumList />
                </div>
            </aside>
            <main className="main">
                {!activeThreadId ? (
                    <div className="card" style={{ padding: 12 }}>
                        <div className="row" style={{ alignItems: 'center' }}>
                            <button className="btn ghost" onClick={() => navigate(`/forum/${forumId}`)}>Back</button>
                            <h3 style={{ margin: 0 }}>Threads</h3>
                            <div className="spacer" />
                            <button className="btn" onClick={onCreateThread}>New Thread</button>
                        </div>
                        {loadingThreads ? (
                            <div style={{ marginTop: 8 }}>Loading...</div>
                        ) : threadsError ? (
                            <div style={{ marginTop: 8, color: 'var(--danger)' }}>{(threadsError as any)?.message ?? 'Error'}</div>
                        ) : (
                            <div className="gallery boards" style={{ marginTop: 12 }}>
                                {threads.map((t) => (
                                    <div key={t.id} className="chiclet" onClick={() => setSelectedThreadId(t.id)}>
                                        <div className="title">{t.title}</div>
                                        <div className="row" style={{ gap: 8, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                                            <button className="btn ghost" onClick={() => onDeleteThread(t)}>Delete</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                            <div className="row" style={{ alignItems: 'center' }}>
                                <button className="btn ghost" onClick={() => setSelectedThreadId(null)}>Back to threads</button>
                                <h3 style={{ margin: 0 }}>{activeThread ? activeThread.title : 'Thread'}</h3>
                                <div className="spacer" />
                                <button className="btn ghost" onClick={() => navigate(`/forum/${forumId}`)}>Back to board</button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
                            {loadingPosts ? <div style={{ padding: 12 }}>Loading...</div> : postsError ? <div style={{ padding: 12, color: 'var(--danger)' }}>{(postsError as any)?.message ?? 'Error'}</div> : (
                                <MessageList messages={posts as any[]} />
                            )}
                        </div>
                        <div className="composer">
                            <textarea className="textarea" value={composerText} onChange={(e) => setComposerText(e.target.value)} placeholder={'Write a post...'} />
                            <button className="btn primary" onClick={onSendPost} disabled={!composerText.trim() || !activeThreadId}>Post</button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

