import { Api } from 'telegram';

type TelegramEntity = any; // Using any to avoid tight coupling with GramJS types

interface ExtractedEntitiesResult {
	plainText: string;
	entities: TelegramEntity[];
}

/**
 * Convert Telegram message entities into a Markdown string. Supports inline code and fenced code blocks.
 */
export function applyTelegramEntitiesToMarkdown(text: string, entities: TelegramEntity[] | undefined): string {
	if (!entities || entities.length === 0) return text;
	// Build insertion maps for start and end tags
	const insertionsStart: Record<number, string[]> = {};
	const insertionsEnd: Record<number, string[]> = {};

	for (const e of entities) {
		const offset: number = Number(e.offset ?? e.start ?? 0);
		const length: number = Number(e.length ?? 0);
		const end = offset + length;
		const cls: string = e.className ?? e._ ?? '';
		if (cls === 'MessageEntityPre' || cls === 'messageEntityPre') {
			const lang: string | undefined = e.language ?? e.lang ?? undefined;
			const startToken = '```' + (lang ? String(lang) : '') + '\n';
			const endToken = '\n```';
			(insertionsStart[offset] ||= []).push(startToken);
			(insertionsEnd[end] ||= []).push(endToken);
		} else if (cls === 'MessageEntityCode' || cls === 'messageEntityCode') {
			(insertionsStart[offset] ||= []).push('`');
			(insertionsEnd[end] ||= []).push('`');
		}
	}

	let result = '';
	for (let i = 0; i <= text.length; i++) {
		if (insertionsStart[i]) result += insertionsStart[i].join('');
		if (i < text.length) result += text[i];
		if (insertionsEnd[i]) result += insertionsEnd[i].join('');
	}
	return result;
}

/**
 * Parse a subset of Markdown (inline code and fenced code blocks) and return plain text + Telegram entities.
 */
export function extractEntitiesFromMarkdown(markdown: string): ExtractedEntitiesResult {
	const entities: TelegramEntity[] = [];
	let plainText = '';

	// First handle fenced code blocks by scanning; supports ```lang\n...\n```
	const fenceRegex = /```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)\n```/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = fenceRegex.exec(markdown)) !== null) {
		const [full, lang, codeBody] = match;
		const before = markdown.slice(lastIndex, match.index);
		plainText += before;
		const offset = plainText.length;
		plainText += codeBody;
		entities.push(new Api.MessageEntityPre({ offset, length: codeBody.length, language: lang || undefined } as any));
		lastIndex = match.index + full.length;
	}
	plainText += markdown.slice(lastIndex);

	// Then handle inline code `...` (avoid matching inside code blocks since they were removed above)
	// We need to iterate and rebuild string to compute offsets accurately
	const rebuilt: string[] = [];
	const inlineRegex = /`([^`\n]+)`/g;
	let idx = 0;
	while (idx < plainText.length) {
		const next = inlineRegex.exec(plainText);
		if (!next) {
			rebuilt.push(plainText.slice(idx));
			break;
		}
		const [full, inner] = next;
		rebuilt.push(plainText.slice(idx, next.index));
		const offset = rebuilt.join('').length;
		rebuilt.push(inner);
		entities.push(new Api.MessageEntityCode({ offset, length: inner.length } as any));
		idx = next.index + full.length;
	}
	const finalText = rebuilt.length ? rebuilt.join('') : plainText;
	return { plainText: finalText, entities };
}

