import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { BoardMeta, composeBoardCard, generateIdHash, compareCards } from '@lib/protocol';
import { CURRENT_PROTOCOL_VERSION } from '@lib/protocol/types';
import { sendPlainMessage, deleteMessages, editMessage } from '@lib/telegram/client';
import { getForumAvatar, useBlobUrl } from '@lib/resourceCache';
import { accountQueryKey, assertAccountScope, captureAccountScope, type AccountScope } from '@lib/accountScope';
import { boardsQueryOptions, threadsQueryOptions, threadActivityQueryOptions, loadMoreBoards, invalidateForumQueries, recordBoardChange, reserveMetadataChange } from '@lib/forumQueries';
import { useUiStore } from '@state/ui';
import SidebarToggle from '@components/SidebarToggle';
import { formatTimeSince } from '@lib/time';

function CachedBoardActivity({ scope, forumId, boardId }: { scope: AccountScope; forumId: number; boardId: string }) {
	const { data } = useQuery({ ...threadsQueryOptions(scope, forumId, boardId), enabled: false });
	const summaries = useQueries({ queries: (data?.items ?? []).map((thread) => ({ ...threadActivityQueryOptions(scope, forumId, thread.id), enabled: false })) });
	const latest = summaries.flatMap((summary) => summary.data ? [summary.data] : []).sort((a, b) => compareCards(b, a))[0];
	return latest ? <div className="sub">Recent activity {formatTimeSince(latest.date)}</div> : null;
}

export default function ForumPage() {
	const { id } = useParams();
	const forumId = Number(id);
	const scope = captureAccountScope();
	const forumMeta = useForumsStore((s) => (Number.isFinite(forumId) ? s.forums[forumId] : undefined));
	const [openMenuForBoardId, setOpenMenuForBoardId] = useState<string | null>(null);
	const { isSidebarCollapsed } = useUiStore();

	const [pending, setPending] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const avatar = useQuery({
		queryKey: accountQueryKey(scope, 'forum-avatar', forumId),
		queryFn: () => getForumAvatar(forumId, scope),
		enabled: Number.isFinite(forumId), staleTime: 60_000, gcTime: 300_000, retry: false,
	});
	const forumAvatarUrl = useBlobUrl(avatar.data);
	const { data, isLoading, error } = useQuery({ ...boardsQueryOptions(scope, forumId), enabled: Number.isFinite(forumId) });

	async function changeBoard(kind: 'create' | 'edit' | 'delete', board?: BoardMeta) {
		if (pending) return;
		const operationScope = captureAccountScope();
		if (kind === 'delete' && !confirm(`Delete board "${board?.title}"? This does not delete child threads or posts.`)) return;
		const title = kind === 'delete' ? '' : prompt(kind === 'create' ? 'Board title?' : 'New board title?', board?.title)?.trim();
		if (kind !== 'delete' && !title) return;
		const description = kind === 'delete' ? '' : prompt('Board description?', board?.description ?? '') ?? '';
		setPending(true);
		setActionError(null);
		let release: (() => void) | undefined;
		try {
			release = reserveMetadataChange(operationScope);
			const input = getInputPeerForForumId(forumId);
			assertAccountScope(operationScope);
			if (kind === 'delete' && board) {
				await deleteMessages(input, [board.messageId], operationScope);
				recordBoardChange(operationScope, forumId, board.id, null);
			} else if (kind === 'edit' && board) {
				await editMessage(input, board.messageId, composeBoardCard(board.id, { title: title!, description }), undefined, operationScope);
				recordBoardChange(operationScope, forumId, board.id, { ...board, title: title!, description });
			} else {
				const id = generateIdHash(16);
				const sent = await sendPlainMessage(input, composeBoardCard(id, { title: title!, description }), undefined, operationScope);
				assertAccountScope(operationScope);
				recordBoardChange(operationScope, forumId, id, { id, version: CURRENT_PROTOCOL_VERSION, messageId: Number(sent.id), date: Number(sent.date), title: title!, description });
			}
			await invalidateForumQueries(operationScope, forumId);
		} catch (error) {
			if (!operationScope.signal.aborted) setActionError(error instanceof Error ? error.message : 'Board update failed');
		} finally {
			release?.();
			if (!operationScope.signal.aborted) setPending(false);
		}
	}

	async function onLoadMore() {
		setPending(true);
		setActionError(null);
		try { await loadMoreBoards(scope, forumId); }
		catch (error) { if (!scope.signal.aborted) setActionError(error instanceof Error ? error.message : 'Could not load more boards'); }
		finally { if (!scope.signal.aborted) setPending(false); }
	}

	const forumTitle = forumMeta?.title ?? (forumMeta?.username ? `@${forumMeta.username}` : `Forum ${forumId}`);

	return (
		<div className={`content${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
			<aside className="sidebar" style={isSidebarCollapsed ? { padding: 0, borderRight: 'none', overflow: 'hidden' } : undefined}>
				<div className="col" style={isSidebarCollapsed ? { display: 'none' } : undefined}>
					<ForumList />
				</div>
			</aside>
			<SidebarToggle />
			<main className="main">
				<nav className="breadcrumbs" aria-label="Breadcrumb">
					<Link to="/discover">Discover</Link>
					<span aria-hidden="true">/</span>
					<span aria-current="page">{forumTitle}</span>
				</nav>
				<header className="page-heading">
					<div className="row" style={{ alignItems: 'center', gap: 16 }}>
						<div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--border)', display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
							{forumAvatarUrl ? (
								<img src={forumAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
							) : (
								<span style={{ fontSize: 22, color: 'var(--muted)', fontWeight: 700 }}>{forumTitle.charAt(0).toUpperCase()}</span>
							)}
						</div>
						<div style={{ minWidth: 0 }}>
							<div className="eyebrow">Forum</div>
							<h1>{forumTitle}</h1>
							<p className="muted">Find your next conversation in a board below.</p>
						</div>
					</div>
				</header>
				<section className="card board-panel" aria-labelledby="boards-heading">
					<div className="section-heading">
						<h2 id="boards-heading">Boards</h2>
						<button className="btn primary" disabled={pending} onClick={() => changeBoard('create')}>New board</button>
					</div>
					{actionError && <div className="alert" role="alert">{actionError}</div>}
					{isLoading ? (
						<div className="empty-state" role="status">Loading boards from this forum…</div>
					) : error ? (
						<div className="alert" role="alert">
							<strong>Could not load boards</strong>
							<p>{error.message || 'Please try opening this forum again.'}</p>
						</div>
					) : !(data?.items ?? []).length ? (
						<div className="empty-state">
							<h3>No boards yet</h3>
							<p>Create the first board to give this forum a place to gather.</p>
						</div>
					) : (
						<div className="gallery boards">
							{(data?.items ?? []).map((b) => (
								<div key={b.id} className="chiclet">
									<Link className="discussion-link" to={`/forum/${forumId}/board/${b.id}`}>
										<div className="title">{b.title}</div>
										{b.description && <div className="desc">{b.description}</div>}
										<CachedBoardActivity scope={scope} forumId={forumId} boardId={b.id} />
									</Link>
									<div style={{ position: 'relative', flexShrink: 0 }}>
										<button className="btn ghost" onClick={() => setOpenMenuForBoardId(openMenuForBoardId === b.id ? null : b.id)} aria-label={`More options for ${b.title}`} aria-expanded={openMenuForBoardId === b.id}>More</button>
										{openMenuForBoardId === b.id && (
											<div className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 5, padding: 8, minWidth: 160 }}>
												<div className="col" style={{ gap: 6 }}>
													<button className="btn" disabled={pending} onClick={() => { setOpenMenuForBoardId(null); changeBoard('edit', b); }}>Edit board</button>
													<button className="btn ghost" disabled={pending} style={{ color: 'var(--danger)' }} onClick={() => { setOpenMenuForBoardId(null); changeBoard('delete', b); }}>Delete board</button>
												</div>
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
					{data && !data.complete && <div className="row"><span className="muted">More boards may be available.</span><button className="btn" disabled={pending} onClick={onLoadMore}>Load more boards</button></div>}
				</section>
			</main>
		</div>
	);
}