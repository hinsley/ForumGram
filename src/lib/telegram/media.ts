import { Api } from 'telegram';

export type PreparedInputMedia = {
	kind: 'photo' | 'document';
	inputMedia: Api.TypeInputMedia;
	name?: string;
	mimeType?: string;
};

export async function prepareExistingInputMedia(media: any): Promise<PreparedInputMedia | null> {
	if (!media) return null;
	try {
		// MessageMediaPhoto
		if ((media.className === 'MessageMediaPhoto' || media._ === 'messageMediaPhoto') && media.photo) {
			const photo = media.photo;
			const id = (photo.id ?? photo.photoId) as any;
			const accessHash = (photo.accessHash ?? photo.access_hash) as any;
			const fileReference = (photo.fileReference ?? photo.file_reference) as any;
			if (!id || !accessHash || !fileReference) return null;
			const inputMedia = new Api.InputMediaPhoto({ id: new Api.InputPhoto({ id, accessHash, fileReference }) });
			return { kind: 'photo', inputMedia };
		}
		// MessageMediaDocument
		if ((media.className === 'MessageMediaDocument' || media._ === 'messageMediaDocument') && media.document) {
			const doc = media.document;
			const id = (doc.id ?? doc.documentId) as any;
			const accessHash = (doc.accessHash ?? doc.access_hash) as any;
			const fileReference = (doc.fileReference ?? doc.file_reference) as any;
			if (!id || !accessHash || !fileReference) return null;
			const inputMedia = new Api.InputMediaDocument({ id: new Api.InputDocument({ id, accessHash, fileReference }) });
			let name: string | undefined;
			let mimeType: string | undefined = (doc.mimeType ?? doc.mime_type) as any;
			if (Array.isArray(doc.attributes)) {
				for (const attr of doc.attributes) {
					if (attr.className === 'DocumentAttributeFilename' || attr._ === 'documentAttributeFilename') {
						name = (attr.fileName ?? attr.file_name) as any;
					}
				}
			}
			return { kind: 'document', inputMedia, name, mimeType };
		}
		return null;
	} catch {
		return null;
	}
}

export async function prepareUploadedInputMedia(uploadedFile: any, file: File): Promise<PreparedInputMedia> {
	const isImage = (file.type || '').startsWith('image/');
	if (isImage) {
		const inputMedia = new Api.InputMediaUploadedPhoto({ file: uploadedFile });
		return { kind: 'photo', inputMedia, name: file.name, mimeType: file.type };
	}
	const attributes: any[] = [new Api.DocumentAttributeFilename({ fileName: file.name })];
	const inputMedia = new Api.InputMediaUploadedDocument({ file: uploadedFile, mimeType: file.type || 'application/octet-stream', attributes });
	return { kind: 'document', inputMedia, name: file.name, mimeType: file.type };
}

