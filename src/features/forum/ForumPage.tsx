import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { searchBoardCards, BoardMeta, composeBoardCard, generateIdHash, getLastPostForBoard } from '@lib/protocol';
import { sendPlainMessage, deleteMessages } from '@lib/telegram/client';
import { useUiStore } from '@state/ui';
import SidebarToggle from '@components/SidebarToggle';
import { formatTimeSince } from '@lib/time';

export default function ForumPage() {
	const { id } = useParams();
	const forumId = Number(id);
	const navigate = useNavigate();
	const initForums = useForumsStore((s) => s.initFromStorage);
	const forumMeta = useForumsStore((s) => (Number.isFinite(forumId) ? s.forums[forumId] : undefined));
	const [openMenuForBoardId, setOpenMenuForBoardId] = useState<string | null>(null);
	const { isSidebarCollapsed } = useUiStore();

	useEffect(() => { initForums(); }, [initForums]);
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ['boards', forumId],
		queryFn: async () => {
			const input = getInputPeerForForumId(forumId);
			const boards = await searchBoardCards(input, 200);
			boards.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
			return boards as BoardMeta[];
		},
		enabled: Number.isFinite(forumId),
	});

	const { data: lastPostByBoardId = {}, isLoading: loadingLastPosts } = useQuery<{ [boardId: string]: any }>({
		queryKey: ['last-post-by-board', forumId, (data ?? []).map((b) => b.id)],
		queryFn: async () => {
			const input = getInputPeerForForumId(forumId);
			const entries = await Promise.all((data ?? []).map(async (b) => {
				const lp = await getLastPostForBoard(input, b.id);
				return [b.id, lp] as const;
			}));
			return Object.fromEntries(entries);
		},
		enabled: Number.isFinite(forumId) && (data ?? []).length > 0,
		staleTime: 5_000,
	});



	async function onCreateBoard() {
		try {
			const title = prompt('Board title?')?.trim();
			if (!title) return;
			const description = prompt('Board description?') ?? '';
			const id = generateIdHash(16);
			const text = composeBoardCard(id, { title, description });
			const input = getInputPeerForForumId(forumId);
			await sendPlainMessage(input, text);
			await new Promise((r) => setTimeout(r, 500));
			await refetch();
		} catch (e: any) {
			alert(e?.message ?? 'Failed to create board');
		}
	}

	async function onEditBoard(b: BoardMeta) {
		try {
			const newTitle = prompt('New board title?', b.title)?.trim();
			if (!newTitle) return;
			const newDesc = prompt('New board description?', b.description ?? '') ?? '';
			const input = getInputPeerForForumId(forumId);
			const newText = composeBoardCard(b.id, { title: newTitle, description: newDesc });
			const sent: any = await sendPlainMessage(input, newText);
			const newMsgId: number = Number(sent?.id ?? sent?.message?.id ?? 0);
			if (newMsgId) {
				await deleteMessages(input, [b.messageId]);
			}
			await new Promise((r) => setTimeout(r, 300));
			await refetch();
		} catch (e: any) {
			alert(e?.message ?? 'Failed to edit board');
		}
	}

	async function onDeleteBoard(b: BoardMeta) {
		try {
			if (!confirm(`Delete board "${b.title}"? This does not delete child threads or posts.`)) return;
			const input = getInputPeerForForumId(forumId);
			await deleteMessages(input, [b.messageId]);
			await new Promise((r) => setTimeout(r, 300));
			await refetch();
		} catch (e: any) {
			alert(e?.message ?? 'Failed to delete board');
		}
	}

	return (
		<div className="content" style={{ gridTemplateColumns: isSidebarCollapsed ? '16px 1fr' : undefined }}>
			<aside className="sidebar" style={isSidebarCollapsed ? { padding: 0, borderRight: 'none', overflow: 'hidden' } : undefined}>
				<div className="col" style={isSidebarCollapsed ? { display: 'none' } : undefined}>
					<ForumList />
				</div>
			</aside>
			<SidebarToggle />
			<main className="main">
				<div className="card" style={{ padding: 12 }}>
					<h3>{forumMeta?.title ?? (forumMeta?.username ? `@${forumMeta.username}` : `Forum ${forumId}`)}</h3>
					<div className="col">
						<div className="row" style={{ alignItems: 'center' }}>
							<h4 style={{ marginTop: 0, marginBottom: 0 }}>Boards</h4>
							<button className="btn" onClick={onCreateBoard}>+</button>
						</div>
						{isLoading ? (
							<div>Loading...</div>
						) : error ? (
							<div style={{ color: 'var(--danger)' }}>{(error as any)?.message ?? 'Error'}</div>
						) : (
							<div className="gallery boards">
								{(data ?? []).map((b) => (
									<div key={b.id} className="chiclet" style={{ position: 'relative' }} onClick={() => navigate(`/forum/${forumId}/board/${b.id}`)}>
										<div className="title">{b.title}</div>
										{(b.description) && (
											<div className="sub">{b.description}</div>
										)}
										{(() => {
											const lp: any = (lastPostByBoardId as any)[b.id];
											if (!lp) return null;
											const since = formatTimeSince(lp.date);
											return <div className="sub">Active {since}</div>;
										})()}
										<div style={{ position: 'absolute', top: 8, right: 8 }} onClick={(e) => e.stopPropagation()}>
											<button className="btn ghost" onClick={() => setOpenMenuForBoardId(openMenuForBoardId === b.id ? null : b.id)} title="More">⋯</button>
											{openMenuForBoardId === b.id && (
												<div style={{ position: 'absolute', top: 36, right: 0, zIndex: 5 }}>
													<div className="card" style={{ padding: 8, minWidth: 180 }}>
														<div className="col" style={{ gap: 6 }}>
															<button className="btn" onClick={() => { setOpenMenuForBoardId(null); onEditBoard(b); }}>Edit</button>
															<button className="btn" style={{ background: 'transparent', color: 'var(--danger)' }} onClick={() => { setOpenMenuForBoardId(null); onDeleteBoard(b); }}>Delete</button>
														</div>
													</div>
												</div>
											)}
										</div>
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