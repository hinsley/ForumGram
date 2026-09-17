import { describe, it, expect } from 'vitest';
import { composePostCard, parsePostCard } from './protocol';

describe('ForumGram post content escaping', () => {
	it('round-trips code fences and quoted content', () => {
		const id = 'testid';
		const threadId = 'thread1';
		const original = '```python\nprint("Hello, world!")\n```';
		const composed = composePostCard(id, threadId, { content: original });
		const parsed = parsePostCard(composed)!;
		expect(parsed.data.content).toBe(original);
	});
}); 