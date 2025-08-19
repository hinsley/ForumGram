import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { searchBoardCards, BoardMeta, composeBoardCard, generateIdHash } from '@lib/protocol';
import { sendPlainMessage, deleteMessages } from '@lib/telegram/client';

export default function ForumPage() {
	const { id } = useParams();
	const forumId = Number(id);
	const navigate = useNavigate();
	const initForums = useForumsStore((s) => s.initFromStorage);
	const forumMeta = useForumsStore((s) => (Number.isFinite(forumId) ? s.forums[forumId] : undefined));

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

	async function onCreateBoard() {
		try {
			const title = prompt('Board title?')?.trim();
			if (!title) return;
			const description = prompt('Board description?') ?? '';
			const id = generateIdHash(16);
			const text = composeBoardCard(id, { title, description });
			const input = getInputPeerForForumId(forumId);
			await sendPlainMessage(input, text);
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
			await refetch();
		} catch (e: any) {
			alert(e?.message ?? 'Failed to delete board');
		}
	}

	return (
		<div className="content">
			<aside className="sidebar">
				<ForumList />
			</aside>
			<main className="main">
				<div className="card" style={{ padding: 12 }}>
					<h3>{forumMeta?.title ?? (forumMeta?.username ? `@${forumMeta.username}` : `Forum ${forumId}`)}</h3>
					<div className="col">
						<div className="row" style={{ alignItems: 'center' }}>
							<h4 style={{ marginTop: 0, marginBottom: 0 }}>Boards</h4>
							<div className="spacer" />
							<button className="btn" onClick={onCreateBoard}>New Board</button>
						</div>
						{isLoading ? (
							<div>Loading...</div>
						) : error ? (
							<div style={{ color: 'var(--danger)' }}>{(error as any)?.message ?? 'Error'}</div>
						) : (
							<div className="gallery boards">
								{(data ?? []).map((b) => (
									<div key={b.id} className="chiclet" onClick={() => navigate(`/forum/${forumId}/board/${b.id}`)}>
										<div className="title">{b.title}</div>
										{(b.description) && (
											<div className="sub">{b.description}</div>
										)}
										<div className="row" style={{ gap: 8, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
											<button className="btn ghost" onClick={() => onEditBoard(b)}>Edit</button>
											<button className="btn ghost" onClick={() => onDeleteBoard(b)}>Delete</button>
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