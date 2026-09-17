import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Api } from 'telegram';
import { generateRandomLong } from 'telegram/Helpers';
import type { BigInteger } from 'big-integer';
import { assertAccountScope, type AccountScope } from '@lib/accountScope';
import { composePostCard, generateIdHash } from '@lib/protocol';
import { getClient } from '@lib/telegram/client';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { prepareUploadedInputMedia, type PreparedInputMedia } from '@lib/telegram/media';
import type { DisplayMessage } from '@components/MessageItem';
import { commitAttachments, DraftOperation, resolveDraftReferences, type PendingAttachment } from './postDraft';

interface Attachment extends PendingAttachment {
	file: File;
	name: string;
	inline: boolean;
	randomId: BigInteger;
	prepared?: PreparedInputMedia;
}
export interface ComposerHandle { edit(message: DisplayMessage): void }
interface Props {
	scope: AccountScope;
	forumId: number;
	threadId: string;
	assertDestination(): void;
	onCommitted(message: DisplayMessage): void;
	currentUser: { id: number; username?: string; firstName?: string; lastName?: string } | null;
}

function acknowledgedMessageId(result: Api.TypeUpdates, randomId: BigInteger) {
	if (result instanceof Api.UpdateShortSentMessage) return result.id;
	if ('updates' in result) {
		for (const update of result.updates) {
			if (update instanceof Api.UpdateMessageID && update.randomId !== undefined && update.randomId.equals(randomId)) return update.id;
		}
	}
	throw new Error('Telegram has not acknowledged the send. Retry reconciles the same send identity.');
}

export default forwardRef<ComposerHandle, Props>(function PostComposer({ scope, forumId, threadId, assertDestination, onCommitted, currentUser }, ref) {
	const [text, setText] = useState('');
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const attachmentsRef = useRef(attachments);
	const [editing, setEditing] = useState<DisplayMessage | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const operation = useRef(new DraftOperation());
	const postIdentity = useRef({ cardId: generateIdHash(16), randomId: generateRandomLong() });
	const updateAttachments = (update: (previous: Attachment[]) => Attachment[]) => {
		attachmentsRef.current = update(attachmentsRef.current);
		setAttachments(attachmentsRef.current);
	};
	function assertCurrent(generation: number) {
		assertAccountScope(scope);
		assertDestination();
		operation.current.assert(generation);
	}
	function resetDraft() {
		operation.current.reset();
		setText('');
		updateAttachments(() => []);
		setEditing(null);
		setPending(false);
		setError(null);
		postIdentity.current = { cardId: generateIdHash(16), randomId: generateRandomLong() };
	}
	useImperativeHandle(ref, () => ({ edit(message) {
		if (pending) return;
		resetDraft();
		setEditing(message);
		setText(message.text);
	} }));

	async function uploadFiles(files: File[], inline: boolean, generation = operation.current.capture()) {
		try {
			assertCurrent(generation);
			if (pending) return;
			const added: Attachment[] = files.map(file => ({ id: generateIdHash(16), placeholderId: `upload_${generateIdHash(16)}`, file, name: file.name, inline, status: 'uploading', randomId: generateRandomLong() }));
			const replaced = !inline ? attachmentsRef.current.filter(a => !a.inline) : [];
			updateAttachments(previous => inline ? [...previous, ...added] : [...previous.filter(a => a.inline), ...added]);
			setText(previous => {
				let next = previous;
				for (const attachment of replaced) next = next.replace(new RegExp(`!?\\[[^\\]]*\\]\\(tg-media:${attachment.placeholderId}\\)`, 'g'), '');
				return next + added.map(a => `\n\n${inline ? '!' : ''}[${a.name.replace(/[\[\]\\]/g, '')}](tg-media:${a.placeholderId})`).join('');
			});
			const client = await getClient(scope);
			assertCurrent(generation);
			for (const attachment of added) {
				assertCurrent(generation);
				if (!attachmentsRef.current.some(a => a.id === attachment.id)) continue;
				try {
					const uploaded = await client.uploadFile({ file: attachment.file, workers: 1 });
					assertCurrent(generation);
					if (!attachmentsRef.current.some(a => a.id === attachment.id)) continue;
					const prepared = await prepareUploadedInputMedia(uploaded, attachment.file);
					assertCurrent(generation);
					updateAttachments(previous => previous.map(a => a.id === attachment.id ? { ...a, status: 'uploaded', prepared } : a));
				} catch (cause) {
					assertCurrent(generation);
					updateAttachments(previous => previous.map(a => a.id === attachment.id ? { ...a, status: 'error' } : a));
					setError(cause instanceof Error ? cause.message : 'Upload failed. Remove the attachment and select it again.');
				}
			}
		} catch (cause) {
			if (cause instanceof Error && cause.name === 'AbortError') return;
			setError(cause instanceof Error ? cause.message : 'Could not upload attachment.');
		}
	}
	function pickFiles(inline: boolean) {
		const generation = operation.current.capture();
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = inline;
		if (inline) input.accept = 'image/jpeg,image/png,image/gif,image/heic,image/heif';
		input.onchange = () => void uploadFiles(Array.from(input.files ?? []), inline, generation);
		input.click();
	}
	function removeAttachment(id: string) {
		const attachment = attachmentsRef.current.find(a => a.id === id);
		updateAttachments(previous => previous.filter(a => a.id !== id));
		if (attachment) setText(previous => previous.replace(new RegExp(`!?\\[[^\\]]*\\]\\(tg-media:${attachment.placeholderId}\\)`, 'g'), ''));
	}
	async function submit() {
		const generation = operation.current.begin();
		if (generation === null) return;
		setPending(true);
		setError(null);
		try {
			assertCurrent(generation);
			if (!text.trim()) return;
			if (attachmentsRef.current.some(a => a.status !== 'uploaded')) throw new Error('Resolve or remove unfinished uploads before posting.');
			const client = await getClient(scope);
			assertCurrent(generation);
			const peer = getInputPeerForForumId(forumId);
			const referenced = attachmentsRef.current.filter(a => text.includes(`tg-media:${a.placeholderId}`));
			const ids = await commitAttachments(referenced, async attachment => {
				assertCurrent(generation);
				if (!attachment.prepared) throw new Error('Attachment is not ready.');
				const result = await client.invoke(new Api.messages.SendMedia({ peer, media: attachment.prepared.inputMedia, message: '', randomId: attachment.randomId }));
				return acknowledgedMessageId(result, attachment.randomId);
			}, () => assertCurrent(generation), (id, messageId) => {
				updateAttachments(previous => previous.map(a => a.id === id ? { ...a, messageId } : a));
			});
			assertCurrent(generation);
			const content = resolveDraftReferences(text, ids);
			const cardId = editing?.cardId ?? postIdentity.current.cardId;
			const message = composePostCard(cardId, threadId, { content });
			let messageId = editing?.id;
			if (editing) {
				await client.invoke(new Api.messages.EditMessage({ peer, id: editing.id, message }));
			} else {
				const result = await client.invoke(new Api.messages.SendMessage({ peer, message, randomId: postIdentity.current.randomId }));
				messageId = acknowledgedMessageId(result, postIdentity.current.randomId);
			}
			assertCurrent(generation);
			if (!messageId || !Number.isSafeInteger(messageId)) throw new Error('Telegram has not acknowledged the post. Your draft is retained; retry reconciles the same send.');
			onCommitted({ ...(editing ?? {}), id: messageId, cardId, text: content, date: editing?.date ?? Math.floor(Date.now() / 1000), threadId, forumId, authorUserId: currentUser?.id, from: currentUser?.username ? '@' + currentUser.username : [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || 'You' });
			resetDraft();
		} catch (cause) {
			try { assertCurrent(generation); } catch { return; }
			setError(cause instanceof Error ? cause.message : 'Post failed. Your draft and acknowledged attachments are retained.');
		} finally {
			operation.current.finish(generation);
			try { assertCurrent(generation); setPending(false); } catch { /* The destination no longer owns this operation. */ }
		}
	}

	return <div className="composer">
		<div className="col" style={{ gap: 8 }}>
			<button className="btn" disabled={pending} onClick={() => pickFiles(false)}>Attach file</button>
			<button className="btn" disabled={pending} onClick={() => pickFiles(true)}>Add images</button>
		</div>
		<div className="col" style={{ gap: 8, minWidth: 0 }}>
			<label htmlFor="post-composer">{editing ? 'Edit your post' : 'Write a reply'}</label>
			<p id="composer-help" className="muted" style={{ margin: 0, fontSize: 13 }}>Markdown supported. Add images or drop them into your reply.</p>
			<textarea className="textarea" id="post-composer" aria-describedby="composer-help" rows={5} value={text} disabled={pending} onChange={event => setText(event.target.value)} placeholder={editing ? 'Edit your post...' : 'Write a post...'} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!pending) void uploadFiles(Array.from(event.dataTransfer.files).filter(file => ['image/jpeg', 'image/png', 'image/gif', 'image/heic', 'image/heif'].includes(file.type)), true); }} />
			{error && <div className="alert" role="alert">{error}</div>}
			{attachments.length > 0 && <div className="card" aria-label="Attachments" style={{ padding: 12 }}><div style={{ display: 'grid', gap: 6 }}>
				{attachments.map(attachment => <div key={attachment.id} className="row" style={{ alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
					<div style={{ overflowWrap: 'anywhere' }}>{attachment.name}{attachment.inline ? ' (inline)' : ''} <span role="status" className="muted">{attachment.messageId ? 'Sent — retained for retry' : attachment.status === 'uploaded' ? 'Ready' : attachment.status === 'uploading' ? 'Uploading…' : 'Failed — remove and select again'}</span></div>
					<button className="btn ghost" disabled={pending} aria-label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}>Remove</button>
				</div>)}
			</div></div>}
		</div>
		<div className="col" style={{ alignItems: 'stretch', gap: 8 }}>
			<button className="btn primary" onClick={() => void submit()} disabled={pending || !text.trim() || attachments.some(a => a.status !== 'uploaded')}>{pending ? 'Submitting…' : editing ? 'Save changes' : 'Post reply'}</button>
			{editing && <button className="btn ghost" disabled={pending} onClick={resetDraft}>Cancel edit</button>}
		</div>
	</div>;
});
