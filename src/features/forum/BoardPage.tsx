import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ForumList from '@components/ForumList';
import { useForumsStore } from '@state/forums';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { useQuery } from '@tanstack/react-query';
import { ThreadMeta, searchThreadCards, composeThreadCard, composePostCard, generateIdHash, searchBoardCards, getLastPostForThread, fetchPostPage } from '@lib/protocol';
import { deleteMessages, sendPlainMessage, getClient, editMessage, downloadForumAvatar } from '@lib/telegram/client';
import { prepareUploadedInputMedia as tgPrepareUploadedInputMedia, prepareExistingInputMedia as tgPrepareExistingInputMedia } from '@lib/telegram/media';
import MessageList from '@components/MessageList';
import { getAvatarBlob, setAvatarBlob, getForumAvatarBlob, setForumAvatarBlob } from '@lib/db';
import { useSessionStore } from '@state/session';
import { Api } from 'telegram';
import { useUiStore } from '@state/ui';
import SidebarToggle from '@components/SidebarToggle';
import { formatTimeSince } from '@lib/time';

export default function BoardPage() {
	const { id, boardId, threadId, page } = useParams();
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
				else if (typeof raw === 'string' && /^\d+$/.test(raw)) idNum = Number(raw);
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
		staleTime: 300_000, // 5 minutes - disable automatic polling
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
		staleTime: 300_000, // 5 minutes - disable automatic polling
	});



	const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threadId ?? null);
	useEffect(() => {
		setSelectedThreadId(threadId ?? null);
	}, [threadId]);
	const activeThreadId = selectedThreadId;
	const activeThread = (threads || []).find((t) => t.id === activeThreadId) || null;
	const [openMenuForThreadId, setOpenMenuForThreadId] = useState<string | null>(null);
	const [forumAvatarUrl, setForumAvatarUrl] = useState<string | null>(null);
	const currentAvatarUrlRef = useRef<string | null>(null);
	const currentForumIdRef = useRef<number | null>(null);

	// Load forum avatar with stable reference management
	const loadForumAvatar = useCallback(async (targetForumId: number) => {
		if (!Number.isFinite(targetForumId)) return;

		// If we already have the avatar for this forum, don't reload
		if (currentForumIdRef.current === targetForumId && currentAvatarUrlRef.current) {
			if (!forumAvatarUrl) {
				setForumAvatarUrl(currentAvatarUrlRef.current);
			}
			return;
		}

		// Clean up previous Object URL if changing forums
		if (currentAvatarUrlRef.current && currentForumIdRef.current !== targetForumId) {
			URL.revokeObjectURL(currentAvatarUrlRef.current);
			currentAvatarUrlRef.current = null;
		}

		try {
			// Check if we already have this avatar cached
			let cached = await getForumAvatarBlob(targetForumId);
			if (cached) {
				const newUrl = URL.createObjectURL(cached);
				currentAvatarUrlRef.current = newUrl;
				currentForumIdRef.current = targetForumId;
				setForumAvatarUrl(newUrl);
				return;
			}

			// Try to download the avatar from Telegram
			const downloaded = await downloadForumAvatar(targetForumId);
			if (downloaded) {
				await setForumAvatarBlob(targetForumId, downloaded);
				const newUrl = URL.createObjectURL(downloaded);
				currentAvatarUrlRef.current = newUrl;
				currentForumIdRef.current = targetForumId;
				setForumAvatarUrl(newUrl);
			} else {
				currentAvatarUrlRef.current = null;
				currentForumIdRef.current = targetForumId;
				setForumAvatarUrl(null);
			}
		} catch (e) {
			console.error(`Failed to load avatar for forum ${targetForumId}:`, e);
			currentAvatarUrlRef.current = null;
			currentForumIdRef.current = targetForumId;
			setForumAvatarUrl(null);
		}
	}, [forumAvatarUrl]);

	// Load avatar when forumId changes
	useEffect(() => {
		loadForumAvatar(forumId);
	}, [forumId, loadForumAvatar]);

	// Cleanup Object URL when component unmounts
	useEffect(() => {
		return () => {
			// Only cleanup if we're navigating away from this forum entirely
			// This prevents cleanup during navigation within the same forum
			setTimeout(() => {
				if (currentAvatarUrlRef.current && currentForumIdRef.current !== forumId) {
					URL.revokeObjectURL(currentAvatarUrlRef.current);
					currentAvatarUrlRef.current = null;
				}
			}, 100);
		};
	}, [forumId]);

	// Normalize current page, default to 1 and redirect to include page param if missing.
	const currentPage = Math.max(1, Number.isFinite(Number(page)) ? Number(page) : 1);
	useEffect(() => {
		// Only redirect when the URL actually contains a threadId but lacks a page.
		if (threadId && !page) {
			navigate(`/forum/${forumId}/board/${boardId}/thread/${threadId}/page/1`, { replace: true });
		}
	}, [threadId, page, forumId, boardId, navigate]);

	const { data: pageData, isLoading: loadingPosts, error: postsError } = useQuery<{ items: any[]; count: number; pages: number }>({
		queryKey: ['posts', forumId, boardId, activeThreadId, currentPage],
		queryFn: async () => {
			if (!activeThreadId) return { items: [] as any[], count: 0, pages: 1 };
			const input = getInputPeerForForumId(forumId);
			const { items, count, pages } = await fetchPostPage(input, String(activeThreadId), currentPage, 10);
			// Media references are now handled directly by MarkdownView from text content.
			const client = await getClient();
			const enrichedItems = await Promise.all((items ?? []).map(async (p: any) => {
				return p;
			}));
			// Build author map and load avatars once per unique user.
			const uniqueUserIds = Array.from(new Set(enrichedItems.map((p: any) => p.fromUserId).filter(Boolean))) as number[];
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
			const mapped = enrichedItems.map((p: any) => ({
				id: p.messageId,
				from: p.fromUserId ? (p.user?.username ? '@' + p.user.username : [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ')) : 'unknown',
				date: p.date ?? 0,
				text: p.content,
				threadId: p.parentThreadId,
				avatarUrl: p.fromUserId ? userIdToUrl[p.fromUserId] : undefined,

				groupedId: p.groupedId,
				cardId: p.id,
				authorUserId: p.fromUserId,
				forumId: forumId as number,
				canEdit: false,
				canDelete: false,
			}));
			mapped.sort((a, b) => a.date - b.date);
			return { items: mapped as any[], count, pages };
		},
		enabled: Number.isFinite(forumId) && Boolean(activeThreadId),
		staleTime: 300_000, // 5 minutes - disable automatic polling
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
	type DraftAttachment = { id: string; file?: File; status: 'idle'|'uploading'|'uploaded'|'error'; prepared?: PreparedInputMedia; fromExisting?: boolean; name?: string; mimeType?: string; isInline?: boolean; placeholderId?: string };
	const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
	const [isEditing, setIsEditing] = useState(false);
	const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
	const [showPostSubmitted, setShowPostSubmitted] = useState(false);
	const hidePostSubmittedTimerRef = useRef<number | undefined>(undefined);

	function isAllowedInlineMedia(file: File): boolean {
		const type = (file.type || '').toLowerCase();
		const name = (file.name || '').toLowerCase();
		const ext = name.split('.').pop() || '';
		if (type === 'image/webp' || ext === 'webp') return false;
		if (type.startsWith('image/')) {
			return type === 'image/jpeg' || type === 'image/png' || type === 'image/gif' || type === 'image/heic' || type === 'image/heif';
		}
		// Disallow videos and other types for inline media.
		if (type.startsWith('video/')) return false;
		return ['jpg','jpeg','png','gif','heic','heif'].includes(ext);
	}

	function injectInlineMarkdownPlaceholders(attList: { placeholderId: string; name: string }[]) {
		if (!attList.length) return;
		let addition = '';
		for (const a of attList) {
			addition += `\n\n![${a.name}](tg-media:${a.placeholderId})`;
		}
		setComposerText((prev) => `${prev}${addition}`);
	}

	const prepareUploadedInputMedia = tgPrepareUploadedInputMedia as unknown as (uploaded: any, file: File) => Promise<PreparedInputMedia>;

	const prepareExistingInputMedia = async (media: any): Promise<PreparedInputMedia | undefined> => {
		const res = await tgPrepareExistingInputMedia(media);
		return res ?? undefined;
	};

	// Use imported sendMediaMessage / sendMultiMediaMessage from client.

	async function onSendPost() {
		try {
			if (!activeThreadId) return;
			const input = getInputPeerForForumId(forumId);
			if (isEditing && editingMessageId) {
				// Edit in place for text only; media references are extracted from text content.
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
					try { window.location.reload(); } catch {}
					return;
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
					.map(a => ({ att: a, prepared: a.prepared! }));

				if (prepared.length === 0) {
					const text = composePostCard(idHash, activeThreadId, { content: composerText });
					await sendPlainMessage(input, text);
				} else {
					const inlineOrder: string[] = [];
					try {
						const rx = /\!\[[^\]]*\]\(tg-media:([A-Za-z0-9_-]+)\)/g;
						let m: RegExpExecArray | null;
						while ((m = rx.exec(composerText)) !== null) inlineOrder.push(m[1]);
					} catch {}
					const inlinePrepared = prepared.filter(p => p.att.isInline && p.att.placeholderId && inlineOrder.includes(p.att.placeholderId));
					inlinePrepared.sort((a, b) => inlineOrder.indexOf(a.att.placeholderId!) - inlineOrder.indexOf(b.att.placeholderId!));
					const nonInlinePrepared = prepared.filter(p => !p.att.isInline || !p.att.placeholderId || !inlineOrder.includes(p.att.placeholderId));
					const finalPrepared = [...inlinePrepared, ...nonInlinePrepared];

					// Send each media as a separate message without caption; collect message IDs.
					const client = await getClient();
					const sentIds: number[] = [];
					for (const fp of finalPrepared) {
						try {
							const res: any = await client.invoke(new Api.messages.SendMedia({ peer: input, media: fp.prepared.inputMedia, message: '' } as any));
							const mid = Number((res?.updates ?? []).map((u: any) => u.message?.id || u?.id).find((v: any) => Number.isFinite(Number(v))));
							if (Number.isFinite(mid)) sentIds.push(Number(mid));
						} catch {}
					}

					// Map placeholder IDs to actual message IDs
					const placeholderToMessageId = new Map<string, number>();
					finalPrepared.forEach((p, idx) => {
						if (p.att.placeholderId && sentIds[idx]) {
							placeholderToMessageId.set(p.att.placeholderId, sentIds[idx]);
						}
					});

					// Replace placeholders with actual message IDs
					let replacedContent = composerText;
					replacedContent = replacedContent.replace(/(\!\[[^\]]*\]\(tg-media:)([A-Za-z0-9_-]+)(\))/g, (full, a, pid, c) => {
						const messageId = placeholderToMessageId.get(pid);
						return messageId ? `${a}${messageId}${c}` : full;
					});

					const text = composePostCard(idHash, activeThreadId, { content: replacedContent });
					await sendPlainMessage(input, text);
				}
				try { if (hidePostSubmittedTimerRef.current) { clearTimeout(hidePostSubmittedTimerRef.current); } } catch {}
				setShowPostSubmitted(true);
				hidePostSubmittedTimerRef.current = window.setTimeout(() => { setShowPostSubmitted(false); }, 10000);
			}

			setComposerText('');
			setDraftAttachments([]);
			setIsEditing(false);
			setEditingMessageId(null);
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

	function triggerMediaPick() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/jpeg,image/png,image/gif,image/heic,image/heif';
		input.multiple = true;
		input.onchange = async () => {
			const files = Array.from(input.files || []).filter(isAllowedInlineMedia);
			if (!files.length) return;
			const client = await getClient();
			const toAdd: DraftAttachment[] = [];
			const placeholders: { placeholderId: string; name: string }[] = [];
			for (const file of files) {
				const id = generateIdHash(8);
				const placeholderId = generateIdHash(8);
				toAdd.push({ id, file, status: 'uploading', name: file.name, mimeType: file.type, isInline: true, placeholderId });
				placeholders.push({ placeholderId, name: file.name || 'media' });
			}
			setDraftAttachments(prev => [...prev, ...toAdd]);
			injectInlineMarkdownPlaceholders(placeholders);
			for (const att of toAdd) {
				try {
					// @ts-ignore
					const uploaded = await (client as any).uploadFile({ file: att.file!, workers: 1 });
					const prepared = await prepareUploadedInputMedia(uploaded, att.file!);
					setDraftAttachments(prev => prev.map(x => x.id === att.id ? { ...x, status: 'uploaded', prepared } : x));
				} catch {
					setDraftAttachments(prev => prev.map(x => x.id === att.id ? { ...x, status: 'error' } : x));
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
			// Extract media IDs from text for reuse when composing a new post later.
			let existing: DraftAttachment | null = null;
			const mediaIds: number[] = [];
			const rx = /tg-media:(\d+)/g;
			let match;
			while ((match = rx.exec(msg.text)) !== null) {
				mediaIds.push(Number(match[1]));
			}
			if (mediaIds.length > 0) {
				try {
					const editClient = await getClient();
					const msgs: any = await editClient.invoke(new Api.messages.GetMessages({ id: mediaIds.map((n) => new Api.InputMessageID({ id: n })) } as any));
					const list: any[] = (msgs?.messages ?? []).filter((mm: any) => mm && (mm.className === 'Message' || mm._ === 'message'));
					if (list.length > 0) {
						const mediaMsg = list[0];
						const prep = await prepareExistingInputMedia(mediaMsg.media);
						if (prep) existing = { id: generateIdHash(8), status: 'uploaded', prepared: prep, fromExisting: true, name: 'media', mimeType: 'image/jpeg' };
					}
				} catch {}
			}
			setDraftAttachments(existing ? [existing] : []);
		} catch (e: any) {
			alert(e?.message ?? 'Failed to enter edit mode');
		}
	}

	function removeDraftAttachment(id: string) {
		setDraftAttachments(prev => prev.filter(a => a.id !== id));
		const att = draftAttachments.find(a => a.id === id);
		if (att?.isInline && att.placeholderId) {
			const rx = new RegExp(`\\!\\[[^\\]]*\\]\\(tg-media:${att.placeholderId}\\)`, 'g');
			setComposerText(prev => prev.replace(rx, ''));
		}
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
			try { window.location.reload(); } catch {}
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
				{showPostSubmitted && (
					<div onClick={() => setShowPostSubmitted(false)} style={{ position: 'fixed', top: 56, left: 0, right: 0, zIndex: 20, display: 'flex', justifyContent: 'center' }}>
						<div className="card" style={{ padding: 8, cursor: 'pointer' }}>Post submitted. It should become visible within a few minutes.</div>
					</div>
				)}
				{!activeThreadId ? (
					<div className="card" style={{ padding: 12 }}>
						<div className="row" style={{ alignItems: 'center' }}>
							<div className="row" style={{ alignItems: 'center', gap: 12 }}>
								<Link
									to={`/forum/${forumId}`}
									style={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										flexShrink: 0,
										textDecoration: 'none'
									}}
								>
									<div style={{
										width: 32,
										height: 32,
										borderRadius: 16,
										backgroundColor: 'var(--border)',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										overflow: 'hidden',
										cursor: 'pointer',
										transition: 'transform 0.1s ease'
									}}
									onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
									onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
									>
										{forumAvatarUrl ? (
											<img
												src={forumAvatarUrl}
												alt=""
												style={{
													width: '100%',
													height: '100%',
													objectFit: 'cover'
												}}
											/>
										) : (
											<div style={{
												fontSize: 16,
												color: 'var(--muted)',
												fontWeight: 'bold'
											}}>
												{forumTitle.charAt(0).toUpperCase()}
											</div>
										)}
									</div>
								</Link>
								<h3 style={{ margin: 0 }}>
									<Link to={`/forum/${forumId}`}>{forumTitle}</Link>
									{' > '}
									<span>{boardTitle}</span>
								</h3>
							</div>
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
									<div key={t.id} className="chiclet" style={{ position: 'relative' }} onClick={() => { setSelectedThreadId(t.id); navigate(`/forum/${forumId}/board/${boardId}/thread/${t.id}/page/1`); }}>
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
						<div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
							<div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
								<div className="row" style={{ alignItems: 'center' }}>
									<div className="row" style={{ alignItems: 'center', gap: 12 }}>
									<Link
										to={`/forum/${forumId}`}
										style={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											flexShrink: 0,
											textDecoration: 'none'
										}}
									>
										<div style={{
											width: 32,
											height: 32,
											borderRadius: 16,
											backgroundColor: 'var(--border)',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											overflow: 'hidden',
											cursor: 'pointer',
											transition: 'transform 0.1s ease'
										}}
										onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
										onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
										>
											{forumAvatarUrl ? (
												<img
													src={forumAvatarUrl}
													alt=""
													style={{
														width: '100%',
														height: '100%',
														objectFit: 'cover'
													}}
												/>
											) : (
												<div style={{
													fontSize: 16,
													color: 'var(--muted)',
													fontWeight: 'bold'
												}}>
													{forumTitle.charAt(0).toUpperCase()}
												</div>
											)}
										</div>
									</Link>
									<h3 style={{ margin: 0 }}>
										<Link to={`/forum/${forumId}`}>{forumTitle}</Link>
										{' > '}
										<Link to={`/forum/${forumId}/board/${boardId}`}>{boardTitle}</Link>
										{' > '}
										<span>{activeThread ? activeThread.title : 'Thread'}</span>
									</h3>
								</div>
									<div className="spacer" />
								{(() => {
									const totalPages = pageData?.pages ?? 1;
									const onFirst = () => activeThreadId && navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/1`);
									const onPrev = () => activeThreadId && navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/${Math.max(1, currentPage - 1)}`);
									const onNext = () => activeThreadId && navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/${Math.min(totalPages, currentPage + 1)}`);
									const onLast = () => activeThreadId && navigate(`/forum/${forumId}/board/${boardId}/thread/${activeThreadId}/page/${totalPages}`);
									const atFirst = currentPage <= 1;
									const atLast = currentPage >= totalPages;
									return (
										<div className="row" style={{ alignItems: 'center', gap: 6 }}>
											<button className="btn" disabled={atFirst} onClick={onFirst} title="First">⏮️</button>
											<button className="btn" disabled={atFirst} onClick={onPrev} title="Previous">◀️</button>
											<button className="btn" disabled={atLast} onClick={onNext} title="Next">▶️</button>
											<button className="btn" disabled={atLast} onClick={onLast} title="Last">⏭️</button>
											<div style={{ marginLeft: 8, color: 'var(--muted)' }}>{currentPage}/{totalPages}</div>
										</div>
									);
								})()}
								</div>
							</div>
							<div style={{ padding: 0 }}>
							{loadingPosts ? <div style={{ padding: 12 }}>Loading...</div> : postsError ? <div style={{ padding: 12, color: 'var(--danger)' }}>{(postsError as any)?.message ?? 'Error'}</div> : (
								<MessageList messages={(pageData?.items ?? []) as any[]} currentUserId={resolvedUserId} onEditPost={onEditPost} onDeletePost={onDeletePost} />
							)}
							</div>
						</div>
						<div className="composer">
							<div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								<button className="btn" title="Attach files" onClick={() => triggerFilePick()}>
									📎
								</button>
								<button className="btn" title="Attach media inline" onClick={() => triggerMediaPick()}>
									🖼️
								</button>
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								<textarea
									className="textarea"
									value={composerText}
									onChange={(e) => setComposerText(e.target.value)}
									placeholder={isEditing ? 'Edit your post...' : 'Write a post...'}
									onDragOver={(e) => { try { e.preventDefault(); } catch {} }}
									onDrop={async (e) => {
										e.preventDefault();
										try {
											const files = Array.from(e.dataTransfer?.files || []).filter(isAllowedInlineMedia);
											if (!files.length) return;
											const client = await getClient();
											const toAdd: DraftAttachment[] = [];
											const placeholders: { placeholderId: string; name: string }[] = [];
											for (const file of files) {
												const id = generateIdHash(8);
												const placeholderId = generateIdHash(8);
												toAdd.push({ id, file, status: 'uploading', name: file.name, mimeType: file.type, isInline: true, placeholderId });
												placeholders.push({ placeholderId, name: file.name || 'media' });
											}
											setDraftAttachments(prev => [...prev, ...toAdd]);
											injectInlineMarkdownPlaceholders(placeholders);
											for (const att of toAdd) {
												try {
													// @ts-ignore
													const uploaded = await (client as any).uploadFile({ file: att.file!, workers: 1 });
													const prepared = await prepareUploadedInputMedia(uploaded, att.file!);
													setDraftAttachments(prev => prev.map(x => x.id === att.id ? { ...x, status: 'uploaded', prepared } : x));
												} catch {
													setDraftAttachments(prev => prev.map(x => x.id === att.id ? { ...x, status: 'error' } : x));
												}
											}
										} catch {}
									}}
								/>
								{draftAttachments.length > 0 && (
									<div style={{ padding: 8, background: '#0b1529', border: '1px solid var(--border)', borderRadius: 8 }}>
										<div style={{ display: 'grid', gap: 6 }}>
											{draftAttachments.map(att => (
												<div key={att.id} className="row" style={{ alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
													<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
														<div style={{ width: 8, height: 8, borderRadius: 4, background: att.status === 'uploaded' ? 'var(--success)' : att.status === 'uploading' ? 'var(--muted)' : att.status === 'error' ? 'var(--danger)' : 'var(--muted)' }} />
														<div>{att.name || 'attachment'}{att.isInline ? ' (inline)' : ''}</div>
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