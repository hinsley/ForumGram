import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ForumList from '@components/ForumList';
import MessageList from '@components/MessageList';
import type { DisplayMessage } from '@components/MessageItem';
import SidebarToggle from '@components/SidebarToggle';
import { useForumsStore } from '@state/forums';
import { useSessionStore } from '@state/session';
import { useUiStore } from '@state/ui';
import { accountQueryKey, assertAccountScope, captureAccountScope, type AccountScope } from '@lib/accountScope';
import { queryClient } from '@lib/queryClient';
import { boardsQueryOptions, threadsQueryOptions, threadActivityQueryOptions, invalidateForumQueries, recordThreadChange, reserveMetadataChange } from '@lib/forumQueries';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { composeThreadCard, generateIdHash, fetchPostPage, searchThreadCards, mergeCards, type ThreadMeta } from '@lib/protocol';
import { CURRENT_PROTOCOL_VERSION } from '@lib/protocol/types';
import { deleteMessages, sendPlainMessage, editMessage } from '@lib/telegram/client';
import { getForumAvatar, useBlobUrl } from '@lib/resourceCache';
import { formatTimeSince } from '@lib/time';
import PostComposer, { type ComposerHandle } from './PostComposer';

const EMPTY_MESSAGES: DisplayMessage[] = [];

function ThreadActivity({ scope, forumId, threadId }: { scope: AccountScope; forumId: number; threadId: string }) {
	const element = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		const node = element.current;
		if (!node) return;
		const observer = new IntersectionObserver(entries => {
			if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
		}, { rootMargin: '100px' });
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	const activity = useQuery({ ...threadActivityQueryOptions(scope, forumId, threadId), enabled: visible });
	return <div ref={element} className="sub">{activity.data ? `Active ${formatTimeSince(activity.data.date ?? 0)}` : activity.error ? 'Activity unavailable' : activity.isFetching ? 'Loading activity…' : ''}</div>;
}

export default function BoardPage() {
	const { id, boardId, threadId } = useParams();
	const authenticated = useSessionStore(state => state.isAuthenticated);
	const scope = authenticated ? captureAccountScope() : null;
	const destination = `${scope?.accountId}:${scope?.generation}:${id}:${boardId}:${threadId ?? ''}`;
	const destinationRef = useRef(destination);
	destinationRef.current = destination;
	const assertDestination = useCallback(() => {
		if (destinationRef.current !== destination) throw new DOMException('Destination changed', 'AbortError');
	}, [destination]);
	useEffect(() => { destinationRef.current = destination; return () => { destinationRef.current = ''; }; }, [destination]);
	if (!scope) return null;
	return <BoardDestination key={destination} scope={scope} assertDestination={assertDestination} />;
}

function BoardDestination({ scope, assertDestination }: { scope: AccountScope; assertDestination(): void }) {
	const { id, boardId = '', threadId, page } = useParams();
	const forumId = Number(id);
	const activeThreadId = threadId ?? null;
	const navigate = useNavigate();
	const forumMeta = useForumsStore(state => state.forums[forumId]);
	const me = useSessionStore(state => state.user);
	const isSidebarCollapsed = useUiStore(state => state.isSidebarCollapsed);
	const composer = useRef<ComposerHandle>(null);
	const mutationPending = useRef(false);
	const [mutating, setMutating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const [openMenu, setOpenMenu] = useState<string | null>(null);
	const [postChanges, setPostChanges] = useState<Map<string, DisplayMessage | null>>(new Map());
	const boards = useQuery(boardsQueryOptions(scope, forumId));
	const boardMeta = boards.data?.items.find(board => board.id === boardId);
	const threadQuery = useQuery(threadsQueryOptions(scope, forumId, boardId));
	const threads = threadQuery.data?.items ?? [];
	const activeThread = threads.find(thread => thread.id === activeThreadId);
	const avatar = useQuery({ queryKey: accountQueryKey(scope, 'forum-avatar', forumId), queryFn: () => getForumAvatar(forumId, scope), staleTime: 60_000, gcTime: 300_000 });
	const forumAvatarUrl = useBlobUrl(avatar.data);
	const currentPage = Number.isSafeInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
	const postsKey = accountQueryKey(scope, 'posts', forumId, boardId, activeThreadId, currentPage);
	const posts = useQuery({
		queryKey: postsKey,
		queryFn: ({ signal }) => fetchPostPage(getInputPeerForForumId(forumId), activeThreadId!, currentPage, 10, scope, signal),
		enabled: Boolean(activeThreadId), staleTime: 30_000, gcTime: 300_000,
	});
	const canonicalPage = posts.data?.page ?? currentPage;
	useEffect(() => {
		if (activeThreadId && page !== String(canonicalPage)) navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/${canonicalPage}`, { replace: true });
	}, [activeThreadId, page, canonicalPage, forumId, boardId, navigate]);
	const messages = useMemo(() => {
		const mapped = new Map<string, DisplayMessage>();
		for (const post of posts.data?.items ?? []) {
			mapped.set(post.id, { id: post.messageId, cardId: post.id, text: post.content, date: post.date ?? 0, threadId: post.parentThreadId, authorUserId: post.fromUserId, forumId, from: post.user?.username ? '@' + post.user.username : [post.user?.firstName, post.user?.lastName].filter(Boolean).join(' ') || 'unknown' });
		}
		for (const [cardId, change] of postChanges) {
			if (change) mapped.set(cardId, change);
			else mapped.delete(cardId);
		}
		return [...mapped.values()].sort((a, b) => a.date - b.date || a.id - b.id);
	}, [posts.data, postChanges, forumId]);
	const check = useCallback(() => { assertAccountScope(scope); assertDestination(); }, [scope, assertDestination]);
	const onEditPost = useCallback((message: DisplayMessage) => { check(); composer.current?.edit(message); }, [check]);
	const onCommitted = useCallback((message: DisplayMessage) => {
		check();
		setPostChanges(previous => new Map(previous).set(message.cardId!, message));
		setSubmitted(true);
		void invalidateForumQueries(scope, forumId).catch(cause => {
			try { check(); } catch { return; }
			setError(cause instanceof Error ? cause.message : 'Post saved; refresh failed.');
		});
	}, [check, forumId, scope]);
	const onDeletePost = useCallback(async (message: DisplayMessage) => {
		if (mutationPending.current || !confirm('Delete this post?')) return;
		mutationPending.current = true;
		setMutating(true);
		try {
			check();
			await deleteMessages(getInputPeerForForumId(forumId), [message.id], scope);
			check();
			setPostChanges(previous => new Map(previous).set(message.cardId ?? String(message.id), null));
			await invalidateForumQueries(scope, forumId);
		} catch (cause) {
			try { check(); } catch { return; }
			setError(cause instanceof Error ? cause.message : 'Failed to delete post');
		} finally { mutationPending.current = false; setMutating(false); }
	}, [check, forumId, scope]);
	async function mutateThread(action: 'create' | 'edit' | 'delete', thread?: ThreadMeta) {
		if (mutationPending.current) return;
		const title = action === 'delete' ? '' : prompt(action === 'create' ? 'Thread title?' : 'New thread title?', thread?.title)?.trim();
		if (action === 'delete' ? !confirm(`Delete thread "${thread?.title}"? Posts will remain as zombie messages.`) : !title) return;
		mutationPending.current = true;
		setMutating(true);
		setError(null);
		let release: (() => void) | undefined;
		try {
			check();
			release = reserveMetadataChange(scope);
			const input = getInputPeerForForumId(forumId);
			const cardId = thread?.id ?? generateIdHash(16);
			if (action === 'delete') {
				await deleteMessages(input, [thread!.messageId], scope);
				check();
				recordThreadChange(scope, forumId, boardId, cardId, null);
			} else {
				const text = composeThreadCard(cardId, boardId, { title: title! });
				let messageId = thread?.messageId;
				if (thread) await editMessage(input, thread.messageId, text, undefined, scope);
				else { const result = await sendPlainMessage(input, text, undefined, scope); messageId = result.id; }
				check();
				if (!messageId) throw new Error('Telegram did not acknowledge the thread.');
				recordThreadChange(scope, forumId, boardId, cardId, { id: cardId, version: CURRENT_PROTOCOL_VERSION, messageId, parentBoardId: boardId, title: title!, date: thread?.date ?? Math.floor(Date.now() / 1000), creatorUserId: thread?.creatorUserId ?? me?.id });
			}
			await invalidateForumQueries(scope, forumId);
		} catch (cause) {
			try { check(); } catch { return; }
			setError(cause instanceof Error ? cause.message : 'Thread update failed');
		} finally { release?.(); mutationPending.current = false; setMutating(false); }
	}
	async function loadMoreThreads() {
		const offset = threadQuery.data?.nextOffsetId;
		if (!offset || mutationPending.current) return;
		mutationPending.current = true;
		setMutating(true);
		try {
			check();
			const next = await searchThreadCards(getInputPeerForForumId(forumId), boardId, 100, scope, undefined, offset);
			check();
			queryClient.setQueryData(threadsQueryOptions(scope, forumId, boardId).queryKey, previous => ({ ...next, items: mergeCards([...(previous?.items ?? []), ...next.items]) }));
		} catch (cause) {
			try { check(); } catch { return; }
			setError(cause instanceof Error ? cause.message : 'Could not load more threads');
		} finally { mutationPending.current = false; setMutating(false); }
	}
	const forumTitle = forumMeta?.title || `Forum ${forumId}`;
	const boardTitle = boardMeta?.title || `Board ${boardId}`;
	const totalPages = posts.data?.pages ?? 1;
	const goPage = (target: number) => navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/${target}`);
	return <div className={`content${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
		<aside className="sidebar" style={isSidebarCollapsed ? { padding: 0, borderRight: 'none', overflow: 'hidden' } : undefined}><div className="col" style={isSidebarCollapsed ? { display: 'none' } : undefined}><ForumList /></div></aside>
		<SidebarToggle />
		<main className="main">
			<nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/discover">Discover</Link><span aria-hidden="true">/</span><Link to={`/forum/${forumId}`}>{forumTitle}</Link><span aria-hidden="true">/</span>{activeThreadId ? <><Link to={`/forum/${forumId}/board/${boardId}`}>{boardTitle}</Link><span aria-hidden="true">/</span><span aria-current="page">{activeThread?.title ?? 'Thread'}</span></> : <span aria-current="page">{boardTitle}</span>}</nav>
			<header className="page-heading"><div className="row" style={{ alignItems: 'center', gap: 16 }}><div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--border)', display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>{forumAvatarUrl ? <img src={forumAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20, color: 'var(--muted)', fontWeight: 700 }}>{forumTitle.charAt(0).toUpperCase()}</span>}</div><div style={{ minWidth: 0 }}><h1>{activeThreadId ? activeThread?.title ?? 'Thread' : boardTitle}</h1></div></div></header>
			{error && <div className="alert" role="alert">{error}<button className="btn ghost" onClick={() => setError(null)}>Dismiss</button></div>}
			{submitted && <div className="alert row" role="status"><span>Post saved</span><button className="btn ghost" onClick={() => setSubmitted(false)}>Dismiss</button></div>}
			{!activeThreadId ? <section className="card board-panel" aria-labelledby="threads-heading">
				<div className="section-heading"><h2 id="threads-heading">Threads</h2><button className="btn primary" disabled={mutating} onClick={() => void mutateThread('create')}>New thread</button></div>
				{threadQuery.isLoading ? <div className="empty-state" role="status">Loading threads…</div> : threadQuery.error ? <div className="alert" role="alert"><strong>Could not load threads</strong><p>{threadQuery.error.message}</p></div> : !threads.length ? <div className="empty-state"><p>No threads yet</p></div> : <div className="gallery boards">{threads.map(thread => <div key={thread.id} className="chiclet">
					<Link className="discussion-link" to={`/forum/${forumId}/board/${boardId}/thread/${thread.id}/page/1`}><div className="title">{thread.title}</div><ThreadActivity scope={scope} forumId={forumId} threadId={thread.id} /></Link>
					<div style={{ position: 'relative', flexShrink: 0 }}><button className="btn ghost" onClick={() => setOpenMenu(openMenu === thread.id ? null : thread.id)} aria-label={`More options for ${thread.title}`} aria-expanded={openMenu === thread.id}>More</button>{openMenu === thread.id && <div className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 5, padding: 8, minWidth: 160 }}><div className="col" style={{ gap: 6 }}><button className="btn" disabled={mutating} onClick={() => { setOpenMenu(null); void mutateThread('edit', thread); }}>Edit thread</button><button className="btn ghost" disabled={mutating} style={{ color: 'var(--danger)' }} onClick={() => { setOpenMenu(null); void mutateThread('delete', thread); }}>Delete thread</button></div></div>}</div>
				</div>)}</div>}
				{threadQuery.data && !threadQuery.data.complete && <div className="row"><span className="muted">More threads may be available.</span><button className="btn" disabled={mutating} onClick={() => void loadMoreThreads()}>Load more threads</button></div>}
			</section> : <div className="card thread-panel">
				<div className="section-heading"><h2>Posts</h2><nav className="row" aria-label="Post pages" style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><button className="btn ghost" disabled={canonicalPage <= 1} onClick={() => goPage(1)}>First</button><button className="btn" disabled={canonicalPage <= 1} onClick={() => goPage(canonicalPage - 1)}>Previous</button><span className="muted" aria-live="polite">Page {canonicalPage} of {totalPages}</span><button className="btn" disabled={canonicalPage >= totalPages} onClick={() => goPage(canonicalPage + 1)}>Next</button><button className="btn ghost" disabled={canonicalPage >= totalPages} onClick={() => goPage(totalPages)}>Last</button></nav></div>
				{posts.isLoading && !messages.length ? <div className="empty-state" role="status">Loading posts…</div> : posts.error ? <div className="alert" role="alert"><strong>Could not load posts</strong><p>{posts.error.message}</p><button className="btn" onClick={() => void posts.refetch()}>Retry</button></div> : !messages.length ? <div className="empty-state"><p>No posts yet</p></div> : <MessageList messages={messages.length ? messages : EMPTY_MESSAGES} currentUserId={me?.id} onEditPost={onEditPost} onDeletePost={onDeletePost} />}
				<PostComposer ref={composer} scope={scope} forumId={forumId} threadId={activeThreadId} assertDestination={assertDestination} onCommitted={onCommitted} currentUser={me} />
			</div>}
		</main>
	</div>;
}
