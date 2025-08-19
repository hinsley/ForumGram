import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { useQuery } from '@tanstack/react-query';
import { ThreadMeta, searchThreadCards, searchPostCards, composeThreadCard, composePostCard, generateIdHash, searchBoardCards } from '@lib/protocol';
import { deleteMessages, sendPlainMessage, getClient, editMessage } from '@lib/telegram/client';
import MessageList from '@components/MessageList';
import { getAvatarBlob, setAvatarBlob } from '@lib/db';
import { useSessionStore } from '@state/session';
import { Api } from 'telegram';

export default function BoardPage() {
	const { id, boardId, threadId } = useParams();
	const forumId = Number(id);
	const navigate = useNavigate();
	const initForums = useForumsStore((s) => s.initFromStorage);
	const forumMeta = useForumsStore((s) => (Number.isFinite(forumId) ? s.forums[forumId] : undefined));
	const me = useSessionStore((s) => s.user);
	const myUserId = me?.id;

	useEffect(() => { initForums(); }, [initForums]);

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

	const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threadId ?? null);
	const activeThreadId = selectedThreadId;
	const activeThread = (threads || []).find((t) => t.id === activeThreadId) || null;

	const { data: posts = [], isLoading: loadingPosts, error: postsError, refetch: refetchPosts } = useQuery({
		queryKey: ['posts', forumId, boardId, activeThreadId],
		queryFn: async () => {
			if (!activeThreadId) return [] as any[];
			const input = getInputPeerForForumId(forumId);
			const items = await searchPostCards(input, String(activeThreadId));
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
			// Map to display messages, preserving metadata used by both branches.
			const mapped = items.map((p) => ({
				id: p.messageId,
				from: p.fromUserId ? (p.user?.username ? '@' + p.user.username : [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ')) : 'unknown',
				date: p.date ?? 0,
				text: p.content,
				threadId: p.parentThreadId,
				avatarUrl: p.fromUserId ? userIdToUrl[p.fromUserId] : undefined,
				attachments: (p as any).media ? [{ name: 'attachment', isMedia: true, media: (p as any).media }] : [],
				groupedId: p.groupedId,
				cardId: p.id,
				authorUserId: p.fromUserId,
				canEdit: Boolean(myUserId && p.fromUserId && myUserId === p.fromUserId),
				canDelete: Boolean(myUserId && p.fromUserId && myUserId === p.fromUserId),
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
		const isImage = file.type?.startsWith('image/') && file.type !== 'image/svg+xml';
		if (isImage) {
			const media = new Api.InputMediaUploadedPhoto({ file: uploaded });
			return { inputMedia: media, name: file.name, mimeType: file.type };
		}
		const attrs: any[] = [new Api.DocumentAttributeFilename({ fileName: file.name })];
		const media = new Api.InputMediaUploadedDocument({
			file: uploaded,
			mimeType: file.type || 'application/octet-stream',
			attributes: attrs,
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
		await client.invoke(new Api.messages.SendMedia({ peer: input, media, message: caption, randomId: rid }));
	}

	async function sendMultiMediaMessage(input: any, caption: string, mediaList: any[]) {
		const client = await getClient();
		const now = Date.now() * 1000;
		const multiMedia = mediaList.map((m, i) => new Api.InputSingleMedia({
			media: m,
			message: i === 0 ? caption : '',
			randomId: BigInt(now + i + Math.floor(Math.random() * 1000)),
		}));
		await client.invoke(new Api.messages.SendMultiMedia({ peer: input, multiMedia }));
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
				const text = composePostCard(idHash, activeThreadId, { content: composerText });
				const prepared = draftAttachments.filter(a => a.prepared && a.status === 'uploaded').map(a => a.prepared!.inputMedia);
				if (prepared.length === 0) {
					await sendPlainMessage(input, text);
				} else if (prepared.length === 1) {
					await sendMediaMessage(input, text, prepared[0]!);
				} else {
					await sendMultiMediaMessage(input, text, prepared);
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
		input.multiple = true;
		input.onchange = async () => {
			const files = Array.from(input.files || []);
			if (!files.length) return;
			const client = await getClient();
			for (const file of files) {
				if (opts?.filterOutSvg && file.type === 'image/svg+xml') {
					// Skip SVG for media mode.
					continue;
				}
				const id = generateIdHash(8);
				setDraftAttachments(prev => [...prev, { id, file, status: 'uploading', name: file.name, mimeType: file.type }]);
				try {
					// @ts-ignore
					const uploaded = await (client as any).uploadFile({ file, workers: 1 });
					const prepared = await prepareUploadedInputMedia(uploaded, file);
					setDraftAttachments(prev => prev.map(a => a.id === id ? { ...a, status: 'uploaded', prepared } : a));
				} catch {
					setDraftAttachments(prev => prev.map(a => a.id === id ? { ...a, status: 'error' } : a));
				}
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
			const existing: DraftAttachment[] = [];
			if (Array.isArray(msg.attachments)) {
				for (const att of msg.attachments) {
					try {
						const prep = await prepareExistingInputMedia(att.media);
						if (prep) existing.push({ id: generateIdHash(8), status: 'uploaded', prepared: prep, fromExisting: true, name: att.name, mimeType: att.mimeType });
					} catch {}
				}
			}
			setDraftAttachments(existing);
		} catch (e: any) {
			alert(e?.message ?? 'Failed to enter edit mode');
		}
	}

	function removeDraftAttachment(id: string) {
		setDraftAttachments(prev => prev.filter(a => a.id !== id));
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
							<h3 style={{ margin: 0 }}>{forumTitle} &gt; {boardTitle}</h3>
							<div className="spacer" />
						</div>
						<div className="row" style={{ alignItems: 'center', marginTop: 8 }}>
							<h4 style={{ margin: 0 }}>Threads</h4>
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
									<div key={t.id} className="chiclet" onClick={() => { setSelectedThreadId(t.id); navigate(`/forum/${forumId}/board/${boardId}/thread/${t.id}`); }}>
										<div className="title">{t.title}</div>
										<div className="row" style={{ gap: 8, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
											<button className="btn ghost" onClick={() => onEditThread(t)}>Edit</button>
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
								<button className="btn ghost" onClick={() => { setSelectedThreadId(null); navigate(`/forum/${forumId}/board/${boardId}`); }}>Back</button>
								<h3 style={{ margin: 0 }}>{`${forumTitle} > ${boardTitle} > ${activeThread ? activeThread.title : 'Thread'}`}</h3>
								<div className="spacer" />
							</div>
						</div>
						<div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
							{loadingPosts ? <div style={{ padding: 12 }}>Loading...</div> : postsError ? <div style={{ padding: 12, color: 'var(--danger)' }}>{(postsError as any)?.message ?? 'Error'}</div> : (
								<MessageList messages={posts as any[]} currentUserId={myUserId} onEditPost={onEditPost} onDeletePost={onDeletePost} />
							)}
						</div>
						<div className="composer">
							<div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								<button className="btn" title="Attach files" onClick={() => triggerFilePick()}>
									📎
								</button>
								<button className="btn" title="Attach images/videos" onClick={() => triggerFilePick('image/jpeg,image/png,image/webp,video/*', { filterOutSvg: true })}>
									🖼️
								</button>
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								<textarea className="textarea" value={composerText} onChange={(e) => setComposerText(e.target.value)} placeholder={isEditing ? 'Edit your post...' : 'Write a post...'} />
								{draftAttachments.length > 0 && (
									<div style={{ padding: 8, background: '#0b1529', border: '1px solid var(--border)', borderRadius: 8 }}>
										<div style={{ fontWeight: 600, marginBottom: 6 }}>Attachments</div>
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
							<div className="col" style={{ display: 'flex', alignItems: 'flex-start' }}>
								<button className="btn primary" onClick={onSendPost} disabled={!composerText.trim() || !activeThreadId}>
									{isEditing ? 'Save' : 'Post'}
								</button>
							</div>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}