import { describe, expect, it, vi } from 'vitest';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

describe('account lifetime boundaries', () => {
	it('revokes A immediately and waits for its private writes before admitting B', async () => {
		vi.resetModules();
		const lifecycle = await import('./accountScope');
		const a = await lifecycle.activateAccount('A', lifecycle.getAccountGeneration());
		const write = deferred();
		lifecycle.onAccountDispose(() => write.promise);
		const clearing = lifecycle.invalidateAccount();
		expect(a.signal.aborted).toBe(true);
		expect(() => lifecycle.assertAccountScope(a)).toThrow(/no longer active/);
		expect(() => lifecycle.captureAccountScope()).toThrow();
		let admitted = false;
		const admission = lifecycle.activateAccount('B', lifecycle.getAccountGeneration()).then((scope) => { admitted = true; return scope; });
		await Promise.resolve();
		expect(admitted).toBe(false);
		write.resolve();
		await clearing;
		const b = await admission;
		expect(lifecycle.captureAccountScope()).toBe(b);
		expect(lifecycle.accountQueryKey(a, 'posts')).not.toEqual(lifecycle.accountQueryKey(b, 'posts'));
		expect(() => lifecycle.assertAccountScope(a)).toThrow();
	});

	it('runs every cleanup despite thrown invalidators and fails closed after all settle', async () => {
		vi.resetModules();
		const lifecycle = await import('./accountScope');
		const old = await lifecycle.activateAccount('A', lifecycle.getAccountGeneration());
		const write = deferred();
		const observed: string[] = [];
		lifecycle.onAuthInvalidate(() => { throw new Error('reset failed'); });
		lifecycle.onAuthInvalidate(() => { observed.push('reset'); });
		lifecycle.onAccountDispose(() => { throw new Error('purge failed'); });
		lifecycle.onAccountDispose(async () => { await write.promise; observed.push('settled'); });
		const clearing = lifecycle.invalidateAccount();
		expect(old.signal.aborted).toBe(true);
		expect(observed).toEqual(['reset']);
		let finished = false;
		void clearing.catch(() => { finished = true; });
		await Promise.resolve();
		expect(finished).toBe(false);
		write.resolve();
		await expect(clearing).rejects.toThrow('reset failed');
		expect(observed).toEqual(['reset', 'settled']);
		await expect(lifecycle.activateAccount('B', lifecycle.getAccountGeneration())).rejects.toThrow();
		expect(() => lifecycle.captureAccountScope()).toThrow();
	});
});
