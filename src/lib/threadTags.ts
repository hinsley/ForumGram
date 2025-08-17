export const THREAD_TAG_REGEX = /^#t:([A-Z2-7]{4,12})\|s:([A-Za-z0-9_-]{16,})$/m;

export interface ParsedTagLine { id: string; sig: string; }

export function parseTagLine(text: string): ParsedTagLine | null {
	const match = text.match(THREAD_TAG_REGEX);
	if (!match) return null;
	return { id: match[1], sig: match[2] };
}

export function extractThreadId(text: string): string | null {
	return parseTagLine(text)?.id ?? null;
}

export function stripTagLine(text: string): string {
	return text.replace(THREAD_TAG_REGEX, '').trimEnd();
}

export function appendTagLine(text: string, id: string, sig: string): string {
	const sep = text.endsWith('\n') ? '' : '\n';
	return `${text}${sep}#t:${id}|s:${sig}`;
}