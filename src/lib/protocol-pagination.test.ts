import { describe, expect, it } from 'vitest';
import { getPostPageWindow } from './protocol';

describe('ForumGram post pagination', () => {
	it('maps oldest-first pages onto Telegram newest-first offsets', () => {
		expect(getPostPageWindow(25, 0, 1, 10)).toMatchObject({
			page: 1,
			pages: 3,
			indexedAddOffset: 15,
			indexedLimit: 10,
		});
		expect(getPostPageWindow(25, 0, 3, 10)).toMatchObject({
			page: 3,
			indexedAddOffset: 0,
			indexedLimit: 5,
		});
	});

	it('places unindexed fresh posts after indexed results', () => {
		expect(getPostPageWindow(20, 1, 3, 10)).toMatchObject({
			count: 21,
			pages: 3,
			indexedLimit: 0,
			freshStart: 0,
			freshEnd: 1,
		});
		expect(getPostPageWindow(20, 15, 3, 10)).toMatchObject({
			indexedLimit: 0,
			freshStart: 0,
			freshEnd: 10,
		});
		expect(getPostPageWindow(20, 15, 4, 10)).toMatchObject({
			freshStart: 10,
			freshEnd: 15,
		});
	});

	it('normalizes invalid sizes and clamps invalid pages', () => {
		expect(getPostPageWindow(25, 0, 999, 0)).toMatchObject({
			page: 3,
			pageSize: 10,
		});
		expect(getPostPageWindow(250, 0, 2.9, 500)).toMatchObject({
			page: 2,
			pageSize: 100,
		});
	});
});
