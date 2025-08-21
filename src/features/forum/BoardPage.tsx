import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { useQuery } from '@tanstack/react-query';
import { ThreadMeta, searchThreadCards, searchPostCardsSlice, composeThreadCard, composePostCard, generateIdHash, searchBoardCards, getLastPostForThread, countPostsForThread } from '@lib/protocol';
import { deleteMessages, sendPlainMessage, getClient, editMessage } from '@lib/telegram/client';
import MessageList from '@components/MessageList';
import { getAvatarBlob, setAvatarBlob } from '@lib/db';
import { useSessionStore } from '@state/session';
import { Api } from 'telegram';
import { useUiStore } from '@state/ui';
import SidebarToggle from '@components/SidebarToggle';
import { formatTimeSince } from '@lib/time';

export default function BoardPage() {
	const { id, boardId, threadId, page: pageParam } = useParams();
	const forumId = Number(id);
	const navigate = useNavigate();
	const initForums = useForumsStore((s) => s.initFromStorage);
	const forumMeta = useForumsStore((s) => (Number.isFinite(forumId) ? s.forums[forumId] : undefined));
	const me = useSessionStore((s) => s.user);
	const myUserId = me?.id;
	const { isSidebarCollapsed } = useUiStore();

	useEffect(() => { initForums(); }, [initForums]);

	// Resolve current user id even if the session store has not populated yet.
	const [resolvedUserId, setResolvedUserId] = useState<number | undefined>(typeof myUserId === 'number' ? myUserId : undefined);
	useEffect(() => {
		let canceled = false;
		(async () => {
			try {
				if (typeof myUserId === 'number') { setResolvedUserId(myUserId); return; }
				const client = await getClient();
				const meObj: any = await (client as any).getMe();
				const raw = (meObj && (meObj.id ?? meObj.user?.id));
				let idNum: number | undefined = undefined;
				if (typeof raw === 'number') idNum = raw;
				else if (typeof raw === 'bigint') idNum = Number(raw);
				else if (raw && typeof raw.toNumber === 'function') idNum = raw.toNumber();
				else if (raw && typeof raw.toJSNumber === 'function') idNum = raw.toJSNumber();
				else if (raw && typeof raw.value === 'number') idNum = raw.value;
				else if (raw && typeof raw === 'string' && /^\d+$/.test(raw as any)) idNum = Number(raw);
				if (!canceled) setResolvedUserId(idNum);
			} catch {}
		})();
		return () => { canceled = true; };
	}, [myUserId]);

	const { data: boardMeta } = useQuery<{ title?: string; description?: string } | null>({
		queryKey: ['board-meta', forumId, boardId],
		queryFn: async () => {
			const input = getInputPeerForForumId(forumId);
			const boards = await searchBoardCards(input, 300);
			const found = boards.find((b) => b.id === String(boardId));
			return found ? { title: found.title, description: found.description } : null;
		},
		enabled: Number.isFinite(forumId) && Boolean(boardId),
		staleTime: 60_000,
	});

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

	const { data: lastPostByThreadId = {} } = useQuery<{ [threadId: string]: any }>({
		queryKey: ['last-post-by-thread', forumId, boardId, (threads ?? []).map((t) => t.id)],
		queryFn: async () => {
			const input = getInputPeerForForumId(forumId);
			const entries = await Promise.all((threads ?? []).map(async (t) => {
				const lp = await getLastPostForThread(input, t.id);
				return [t.id, lp] as const;
			}));
			return Object.fromEntries(entries);
		},
		enabled: Number.isFinite(forumId) && Boolean(boardId) && (threads ?? []).length > 0,
		staleTime: 5_000,
	});

	const activeThreadId = threadId ?? null;
	const activeThread = (threads || []).find((t) => t.id === activeThreadId) || null;
	const [openMenuForThreadId, setOpenMenuForThreadId] = useState<string | null>(null);

	// Pagination derived from URL
	const pageSize = 10;
	const pageFromUrl = Number(pageParam);
	const currentPage = Number.isFinite(pageFromUrl) && pageFromUrl > 0 ? pageFromUrl : 1;

	// Count total posts for this thread to compute pages
	const { data: totalPostCount = 0 } = useQuery<number>({
		queryKey: ['post-count', forumId, boardId, activeThreadId],
		queryFn: async () => {
			if (!activeThreadId) return 0;
			const input = getInputPeerForForumId(forumId);
			const count = await countPostsForThread(input, String(activeThreadId));
			return count;
		},
		enabled: Number.isFinite(forumId) && Boolean(activeThreadId),
		staleTime: 5_000,
	});

	const totalPages = useMemo(() => {
		const N = totalPostCount || 0;
		return Math.max(1, Math.ceil(N / pageSize));
	}, [totalPostCount, pageSize]);

	// Snap out-of-range deep links to the last page once count is known
	useEffect(() => {
		if (!threadId) return;
		if (!pageParam) return;
		if (totalPostCount > 0 && currentPage > totalPages) {
			navigate(`/forum/${forumId}/board/${boardId}/thread/${threadId}/page/${totalPages}`);
		}
	}, [currentPage, totalPages, totalPostCount, threadId, pageParam, forumId, boardId, navigate]);

	// If a thread route lacks page, redirect to /page/1 (deep-linkable pages)
	useEffect(() => {
		if (threadId && !pageParam) {
			navigate(`/forum/${forumId}/board/${boardId}/thread/${threadId}/page/1`, { replace: true });
		}
	}, [threadId, pageParam, forumId, boardId, navigate]);

	// Fetch just the current page from Telegram using search with addOffset/limit
	const { data: posts = [], isLoading: loadingPosts, error: postsError, refetch: refetchPosts } = useQuery({
		queryKey: ['posts', forumId, boardId, activeThreadId, currentPage, pageSize, totalPostCount],
		queryFn: async () => {
			if (!activeThreadId) return [] as any[];
			const N = totalPostCount || 0;
			const pagesTotal = Math.max(1, Math.ceil((N || 0) / pageSize));
			const pagesFromLatest = Math.max(0, currentPage - 1);
			const exactLimit = currentPage === pagesTotal ? Math.max(1, N - pageSize * (pagesTotal - 1)) : pageSize;
			const input = getInputPeerForForumId(forumId);
			const items = await (await import('@lib/protocol')).searchPostCardsPageByOffsetNew(input, String(activeThreadId), pagesFromLatest, exactLimit);
			// Build author map and load avatars once per unique user.
			const uniqueUserIds = Array.from(new Set(items.map((p) => p.fromUserId).filter(Boolean))) as number[];
			const client = await getClient();
			const userIdToUrl: Record<number, string | undefined> = {};
			for (const uid of uniqueUserIds) {
				try {
					const cached = await getAvatarBlob(uid);
					if (cached) {
						userIdToUrl[uid] = URL.createObjectURL(cached);
						continue;
					}
					let userObj = items.find((p) => p.fromUserId === uid)?.user;
					if (!userObj) {
						try {
							userObj = await (client as any).getEntity(uid);
						} catch {}
					}
					if (userObj) {
						try {
							const data: any = await (client as any).downloadProfilePhoto(userObj);
							const blob = data instanceof Blob ? data : new Blob([data]);
							await setAvatarBlob(uid, blob);
							const url = URL.createObjectURL(blob);
							userIdToUrl[uid] = url;
						} catch {
							userIdToUrl[uid] = undefined;
						}
					} else {
						userIdToUrl[uid] = undefined;
					}
				} catch {
					userIdToUrl[uid] = undefined;
				}
			}
			// Map to display messages
			const mapped = items.map((p) => ({
				id: p.messageId,
				from: p.fromUserId ? (p.user?.username ? '@' + p.user.username : [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ')) : 'unknown',
				date: p.date ?? 0,
				text: p.content,
				threadId: p.parentThreadId,
				avatarUrl: p.fromUserId ? userIdToUrl[p.fromUserId] : undefined,
				attachments: (() => {
					const med: any = (p as any).media;
					if (med && (med.className === 'MessageMediaDocument' || med._ === 'messageMediaDocument')) {
						const doc: any = med.document ?? {};
						let name: string | undefined;
						let mimeType: string | undefined = doc.mimeType ?? doc.mime_type;
						let sizeBytes: number | undefined = typeof doc.size === 'number' ? doc.size : undefined;
						if (Array.isArray(doc.attributes)) {
							for (const attr of doc.attributes) {
								if (attr.className === 'DocumentAttributeFilename' || attr._ === 'documentAttributeFilename') {
									name = (attr.fileName ?? attr.file_name) as any;
									break;
								}
							}
						}
						return [{ name: name ?? 'file', isMedia: false, media: med, mimeType, sizeBytes }];
					}
					return [];
				})(),
				groupedId: p.groupedId,
				cardId: p.id,
				authorUserId: p.fromUserId,
				canEdit: false,
				canDelete: false,
			}));
			mapped.sort((a, b) => a.date - b.date);
			return mapped as any[];
		},
		enabled: Number.isFinite(forumId) && Boolean(activeThreadId) && (typeof totalPostCount === 'number'),
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
			await new Promise((r) => setTimeout(r, 500));
			await refetchThreads();
		} catch (e: any) {
			alert(e?.message ?? 'Failed to create thread');
		}
	}

	async function onEditThread(t: ThreadMeta) {
		try {
			const newTitle = prompt('New thread title?', t.title)?.trim();
			if (!newTitle) return;
			const input = getInputPeerForForumId(forumId);
			const newText = composeThreadCard(t.id, String(boardId), { title: newTitle });
			const sent: any = await sendPlainMessage(input, newText);
			const newMsgId: number = Number(sent?.id ?? sent?.message?.id ?? 0);
			if (newMsgId) {
				await deleteMessages(input, [t.messageId]);
			}
			await new Promise((r) => setTimeout(r, 300));
			await refetchThreads();
		} catch (e: any) {
			alert(e?.message ?? 'Failed to edit thread');
		}
	}

	async function onDeleteThread(t: ThreadMeta) {
		try {
			if (!confirm(`Delete thread "${t.title}"? Posts will remain as zombie messages.`)) return;
			const input = getInputPeerForForumId(forumId);
			await deleteMessages(input, [t.messageId]);
			await new Promise((r) => setTimeout(r, 300));
			await refetchThreads();
		} catch (e: any) {
			alert(e?.message ?? 'Failed to delete thread');
		}
	}

	const [composerText, setComposerText] = useState('');
	type PreparedInputMedia = { inputMedia: any; name?: string; mimeType?: string };
	type DraftAttachment = { id: string; file?: File; status: 'idle'|'uploading'|'uploaded'|'error'; prepared?: PreparedInputMedia; fromExisting?: boolean; name?: string; mimeType?: string };
	const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
	const [isEditing, setIsEditing] = useState(false);
	const [editingMessageId, setEditingMessageId] = useState<number | null>(null);

	async function prepareUploadedInputMedia(uploaded: any, file: File): Promise<PreparedInputMedia> {
		// Always send uploads as files (documents).
		const attributes: any[] = [new Api.DocumentAttributeFilename({ fileName: file.name })];
		const media = new Api.InputMediaUploadedDocument({
			file: uploaded,
			mimeType: file.type || 'application/octet-stream',
			attributes,
			forceFile: true,
		});
		return { inputMedia: media, name: file.name, mimeType: file.type };
	}

	async function prepareExistingInputMedia(media: any): Promise<PreparedInputMedia | undefined> {
		try {
			if (!media) return undefined;
			const mm: any = media;
			if (mm.className === 'MessageMediaPhoto' || mm._ === 'messageMediaPhoto') {
				const p: any = mm.photo ?? mm._photo ?? mm;
				const id = p.id ?? p._id;
				const accessHash = p.accessHash ?? p.access_hash;
				const fileReference = p.fileReference ?? p.file_reference;
				if (id && accessHash && fileReference) {
					const inputPhoto = new Api.InputPhoto({ id, accessHash, fileReference });
					return { inputMedia: new Api.InputMediaPhoto({ id: inputPhoto }) };
				}
			}
			if (mm.className === 'MessageMediaDocument' || mm._ === 'messageMediaDocument') {
				const d: any = mm.document ?? mm._document ?? mm;
				const id = d.id ?? d._id;
				const accessHash = d.accessHash ?? d.access_hash;
				const fileReference = d.fileReference ?? d.file_reference;
				if (id && accessHash && fileReference) {
					const inputDoc = new Api.InputDocument({ id, accessHash, fileReference });
					return { inputMedia: new Api.InputMediaDocument({ id: inputDoc }), mimeType: d.mimeType ?? d.mime_type };
				}
			}
		} catch {}
		return undefined;
	}

	async function sendMediaMessage(input: any, caption: string, media: any) {
		const client = await getClient();
		const rid = BigInt(Date.now() * 1000 + Math.floor(Math.random() * 1000));
		await client.invoke(new Api.messages.SendMedia({ peer: input, media, message: caption, randomId: rid as any }));
	}

	async function onSendPost() {
		try {
			if (!activeThreadId) return;
			const input = getInputPeerForForumId(forumId);
			if (isEditing && editingMessageId) {
				// Edit in place for text only; attachments in edit mode are ignored.
				let cardIdToKeep = '';
				try {
					const client = await getClient();
					const msg: any = await (client as any).getMessages(input as any, [editingMessageId]);
					const m = Array.isArray(msg) ? msg[0] : msg;
					const txt: string = m?.message ?? '';
					const lines = (txt ?? '').split(/\n/);
					cardIdToKeep = (lines[0] === 'fg.post' && lines[1]) ? lines[1].trim() : generateIdHash(16);
				} catch {
					cardIdToKeep = generateIdHash(16);
				}
				const newText = composePostCard(cardIdToKeep, activeThreadId, { content: composerText });
				try {
					await editMessage(input, editingMessageId, newText);
				} catch (e: any) {
					const msg: string = String(e?.message || e?.errorMessage || 'Failed to edit');
					if (msg.toUpperCase().includes('MESSAGE_EDIT_TIME_EXPIRED')) {
						alert('This post can no longer be edited (Telegram edit window expired).');
						setIsEditing(false);
						setEditingMessageId(null);
						return;
					}
					throw e;
				}
			} else {
				const idHash = generateIdHash(16);
				const prepared = draftAttachments
					.filter(a => a.prepared && a.status === 'uploaded')
					.map(a => a.prepared!);
				if (prepared.length === 0) {
					const text = composePostCard(idHash, activeThreadId, { content: composerText });
					await sendPlainMessage(input, text);
				} else if (prepared.length >= 1) {
					// Only send the first attachment as a document.
					const firstText = composePostCard(idHash, activeThreadId, { content: composerText });
					await sendMediaMessage(input, firstText, prepared[0]!.inputMedia);
				}
			}

			setComposerText('');
			setDraftAttachments([]);
			setIsEditing(false);
			setEditingMessageId(null);
			setTimeout(() => { refetchPosts(); }, 250);
		} catch (e: any) {
			alert(e?.message ?? 'Failed to send post');
		}
	}

	function triggerFilePick(accept?: string, opts?: { filterOutSvg?: boolean }) {
		const input = document.createElement('input');
		input.type = 'file';
		if (accept) input.accept = accept;
		input.multiple = false;
		input.onchange = async () => {
			const files = Array.from(input.files || []);
			if (!files.length) return;
			const client = await getClient();
			const file = files[0]!;
			if (opts?.filterOutSvg && file.type === 'image/svg+xml') {
				// Skip SVG.
				return;
			}
			const id = generateIdHash(8);
			// Replace any existing attachment with the new one.
			setDraftAttachments([{ id, file, status: 'uploading', name: file.name, mimeType: file.type }]);
			try {
				// @ts-ignore
				const uploaded = await (client as any).uploadFile({ file, workers: 1 });
				const prepared = await prepareUploadedInputMedia(uploaded, file);
				setDraftAttachments([{ id, file, status: 'uploaded', prepared, name: file.name, mimeType: file.type }]);
			} catch {
				setDraftAttachments([{ id, file, status: 'error', name: file.name, mimeType: file.type }]);
			}
		};
		input.click();
	}

	async function onEditPost(msg: any) {
		try {
			setIsEditing(true);
			setEditingMessageId(msg.id);
			setComposerText(msg.text);
			// Build existing attachments for reuse when composing a new post later.
			let existing: DraftAttachment | null = null;
			if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
				try {
					const att = msg.attachments[0];
					const prep = await prepareExistingInputMedia(att.media);
					if (prep) existing = { id: generateIdHash(8), status: 'uploaded', prepared: prep, fromExisting: true, name: att.name, mimeType: att.mimeType };
				} catch {}
			}
			setDraftAttachments(existing ? [existing] : []);
		} catch (e: any) {
			alert(e?.message ?? 'Failed to enter edit mode');
		}
	}

	function removeDraftAttachment(id: string) {
		setDraftAttachments(prev => prev.filter(a => a.id !== id));
	}

	function cancelEditing() {
		setIsEditing(false);
		setEditingMessageId(null);
		setComposerText('');
		setDraftAttachments([]);
	}

	async function onDeletePost(msg: any) {
		try {
			if (!confirm('Delete this post?')) return;
			const input = getInputPeerForForumId(forumId);
			const ids: number[] = [msg.id];
			const groupedId = msg?.groupedId;
			if (groupedId) {
				try {
					const client = await getClient();
					const page: any = await client.invoke(new Api.messages.GetHistory({ peer: input, addOffset: 0, limit: 100 } as any));
					const msgs: any[] = (page.messages ?? []).filter((mm: any) => (mm.className === 'Message' || mm._ === 'message') && String(mm.groupedId ?? mm.grouped_id ?? '') === String(groupedId));
					ids.splice(0, ids.length, ...msgs.map((mm: any) => Number(mm.id)));
				} catch {}
			}
			await deleteMessages(input, ids);
			setTimeout(() => { refetchPosts(); }, 250);
		} catch (e: any) {
			alert(e?.message ?? 'Failed to delete post');
		}
	}

	const forumTitle = forumMeta?.title ?? (forumMeta?.username ? `@${forumMeta.username}` : `Forum ${forumId}`);
	const boardTitle = boardMeta?.title ?? String(boardId);

	return (
		<div className="content" style={{ gridTemplateColumns: isSidebarCollapsed ? '16px 1fr' : undefined }}>
			<aside className="sidebar" style={isSidebarCollapsed ? { padding: 0, borderRight: 'none', overflow: 'hidden' } : undefined}>
				<div className="col" style={isSidebarCollapsed ? { display: 'none' } : undefined}>
					<ForumList />
				</div>
			</aside>
			<SidebarToggle />
			<main className="main">
				{!activeThreadId ? (
					<div className="card" style={{ padding: 12 }}>
						<div className="row" style={{ alignItems: 'center' }}>
							<h3 style={{ margin: 0 }}>
								<Link to={`/forum/${forumId}`}>{forumTitle}</Link>
								{' > '}
								<span>{boardTitle}</span>
							</h3>
							<div className="spacer" />
						</div>
						<div className="row" style={{ alignItems: 'center', marginTop: 8 }}>
							<h4 style={{ margin: 0 }}>Threads</h4>
							<button className="btn" onClick={onCreateThread}>+</button>
						</div>
						{loadingThreads ? (
							<div style={{ marginTop: 8 }}>Loading...</div>
						) : threadsError ? (
							<div style={{ marginTop: 8, color: 'var(--danger)' }}>{(threadsError as any)?.message ?? 'Error'}</div>
						) : (
							<div className="gallery boards" style={{ marginTop: 12 }}>
								{threads.map((t) => (
									<div key={t.id} className="chiclet" style={{ position: 'relative' }} onClick={() => { navigate(`/forum/${forumId}/board/${boardId}/thread/${t.id}/page/1`); }}>
										<div className="title">{t.title}</div>
										{(() => {
											const lp: any = (lastPostByThreadId as any)[t.id];
											if (!lp) return null;
											const since = formatTimeSince(lp.date);
											return <div className="sub">Active {since}</div>;
										})()}
										<div style={{ position: 'absolute', top: 8, right: 8 }} onClick={(e) => e.stopPropagation()}>
											<button
												className="btn ghost"
												onClick={() => setOpenMenuForThreadId(openMenuForThreadId === t.id ? null : t.id)}
												title="More"
											>
												⋯
											</button>
											{openMenuForThreadId === t.id && (
												<div style={{ position: 'absolute', top: 36, right: 0, zIndex: 5 }}>
													<div className="card" style={{ padding: 8, minWidth: 180 }}>
														<div className="col" style={{ gap: 6 }}>
															<button className="btn" onClick={() => { setOpenMenuForThreadId(null); onEditThread(t); }}>Edit</button>
															<button className="btn" style={{ background: 'transparent', color: 'var(--danger)' }} onClick={() => { setOpenMenuForThreadId(null); onDeleteThread(t); }}>Delete</button>
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
				) : (
					<div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
						<div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
							<div className="row" style={{ alignItems: 'center' }}>
								<h3 style={{ margin: 0 }}>
									<Link to={`/forum/${forumId}`}>{forumTitle}</Link>
									{' > '}
									<Link to={`/forum/${forumId}/board/${boardId}`}>{boardTitle}</Link>
									{' > '}
									<span>{activeThread ? activeThread.title : 'Thread'}</span>
								</h3>
								<div className="spacer" />
								<div className="row" style={{ gap: 6 }}>
									{currentPage > 1 && (
										<button className="btn ghost" onClick={() => navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/1`)}>First</button>
									)}
									{currentPage > 2 && (
										<button className="btn" onClick={() => navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/${Math.max(1, currentPage - 1)}`)}>Previous</button>
									)}
									{currentPage < totalPages - 1 && (
										<button className="btn" onClick={() => navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/${Math.min(totalPages, currentPage + 1)}`)}>Next</button>
									)}
									{currentPage < totalPages && (
										<button className="btn ghost" onClick={() => navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/${totalPages}`)}>Last</button>
									)}
									<div style={{ color: 'var(--muted)', marginLeft: 8 }}>{currentPage}/{totalPages}</div>
								</div>
							</div>
						</div>
						<div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
							{loadingPosts ? <div style={{ padding: 12 }}>Loading...</div> : postsError ? <div style={{ padding: 12, color: 'var(--danger)' }}>{(postsError as any)?.message ?? 'Error'}</div> : (
								<MessageList key={`${activeThreadId || ''}-${currentPage}`} messages={posts as any[]} currentUserId={resolvedUserId} onEditPost={onEditPost} onDeletePost={onDeletePost} />
							)}
						</div>
						<div className="composer">
							<div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								<button className="btn" title="Attach files" onClick={() => triggerFilePick()}>
									📎
								</button>
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								<textarea className="textarea" value={composerText} onChange={(e) => setComposerText(e.target.value)} placeholder={isEditing ? 'Edit your post...' : 'Write a post...'} />
								{draftAttachments.length > 0 && (
									<div style={{ padding: 8, background: '#0b1529', border: '1px solid var(--border)', borderRadius: 8 }}>
										<div style={{ display: 'grid', gap: 6 }}>
											{draftAttachments.map(att => (
												<div key={att.id} className="row" style={{ alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
													<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
														<div style={{ width: 8, height: 8, borderRadius: 4, background: att.status === 'uploaded' ? 'var(--success)' : att.status === 'uploading' ? 'var(--muted)' : att.status === 'error' ? 'var(--danger)' : 'var(--muted)' }} />
														<div>{att.name || 'attachment'}</div>
														<div style={{ color: 'var(--muted)', fontSize: 12 }}>
															{att.status === 'uploading' ? 'Uploading…' : att.status === 'uploaded' ? 'Ready' : att.status === 'error' ? 'Failed' : ''}
														</div>
													</div>
													<button className="btn ghost" onClick={() => removeDraftAttachment(att.id)}>Remove</button>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
							<div className="col" style={{ display: 'flex', alignItems: 'stretch', flexDirection: 'column', gap: 8 }}>
								<button className="btn primary" onClick={onSendPost} disabled={!composerText.trim() || !activeThreadId} style={{ justifyContent: 'center', width: '100%' }}>
									{isEditing ? 'Edit' : 'Post'}
								</button>
								{isEditing ? (
									<button className="btn ghost" style={{ color: 'var(--danger)', justifyContent: 'center', width: '100%' }} onClick={cancelEditing}>Cancel</button>
								) : null}
							</div>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}