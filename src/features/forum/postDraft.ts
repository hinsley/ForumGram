export interface PendingAttachment {
	id: string;
	placeholderId: string;
	status: 'uploading' | 'uploaded' | 'error';
	messageId?: number;
}

/** Owns one destination's draft and synchronously excludes duplicate submits. */
export class DraftOperation {
	private generation = 0;
	private pending = false;
	capture() { return this.generation; }
	assert(generation: number) {
		if (generation !== this.generation) throw new DOMException('Draft destination changed', 'AbortError');
	}
	reset() { this.generation++; this.pending = false; }
	begin() {
		if (this.pending) return null;
		this.pending = true;
		return this.generation;
	}
	finish(generation: number) { if (generation === this.generation) this.pending = false; }
}

/** Commit by attachment identity. Preserve acknowledged sends even if a sibling fails. */
export async function commitAttachments<T extends PendingAttachment>(
	attachments: T[],
	send: (attachment: T) => Promise<number>,
	assertCurrent: () => void,
	onCommitted: (id: string, messageId: number) => void,
): Promise<Map<string, number>> {
	const ids = new Map<string, number>();
	let failure: unknown;
	for (const attachment of attachments) {
		assertCurrent();
		if (attachment.status !== 'uploaded') throw new Error('Resolve or remove unfinished attachments before posting.');
		if (attachment.messageId) {
			ids.set(attachment.placeholderId, attachment.messageId);
			continue;
		}
		try {
			const messageId = await send(attachment);
			assertCurrent();
			if (!Number.isSafeInteger(messageId) || messageId <= 0) throw new Error('Telegram did not acknowledge this attachment. Retry to reconcile it.');
			onCommitted(attachment.id, messageId);
			ids.set(attachment.placeholderId, messageId);
		} catch (error) {
			assertCurrent();
			failure ??= error;
		}
	}
	if (failure) throw failure;
	return ids;
}

export function resolveDraftReferences(content: string, ids: Map<string, number>): string {
	return content.replace(/tg-media:([A-Za-z0-9_-]+)/g, (_full, id: string) => {
		const messageId = ids.get(id);
		if (messageId) return `tg-media:${messageId}`;
		if (/^\d+$/.test(id)) return `tg-media:${id}`;
		throw new Error('An attachment reference is unresolved. Remove it or finish its upload before posting.');
	});
}
