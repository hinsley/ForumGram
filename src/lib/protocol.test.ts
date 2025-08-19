import { describe, it, expect } from 'vitest';
import { composePostCard, parsePostCard } from './protocol';

describe('ForumGram post content escaping', () => {
	it('escapes/unescapes triple backtick code fence with quotes correctly (token mapping)', () => {
		const id = 'testid';
		const threadId = 'thread1';
		const original = '```python\nprint("Hello, world!")\n```';
		const composed = composePostCard(id, threadId, { content: original });
		const jsonStr = composed.split('\n').slice(3).join('\n');
		const parsedObj = JSON.parse(jsonStr);
		// Expect tokenized fence and doubled backslashes from JSON
		expect(parsedObj.content.startsWith('\\btk\\btk\\btkpython\n')).toBe(true);
		// Round-trip restores original
		const parsed = parsePostCard(composed)!;
		expect(parsed.data.content).toBe(original);
	});
}); 