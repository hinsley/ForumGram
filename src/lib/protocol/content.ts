/** Escape ForumGram post content before JSON serialization. */
export function escapePostContentForForumGram(input: string): string {
	if (!input) return '';
	let out = input.replace(/\\/g, '\\\\');
	out = out.replace(/\*/g, '\\ast');
	out = out.replace(/~/g, '\\til');
	out = out.replace(/`/g, '\\btk');
	out = out.replace(/_/g, '\\und');
	return out;
}

/** Restore ForumGram post content after JSON parsing. */
export function unescapePostContentFromForumGram(input: string): string {
	if (!input) return '';
	let out = input;
	out = out.replace(/\\ast/g, '*');
	out = out.replace(/\\til/g, '~');
	out = out.replace(/\\btk/g, '`');
	out = out.replace(/\\und/g, '_');
	out = out.replace(/\\\\/g, '\\');
	return out;
}
