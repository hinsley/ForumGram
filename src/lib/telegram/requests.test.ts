import { describe, it, expect, vi } from 'vitest';
import { runRead } from './requests';

vi.mock('@lib/accountScope', () => ({
	assertAccountScope: (scope: { signal: AbortSignal }) => { if (scope.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); },
}));

function deferred() {
	let resolve!: (value: number) => void;
	const promise = new Promise<number>((done) => { resolve = done; });
	return { promise, resolve };
}

describe('bounded read scheduling', () => {
	it('retains four in-flight slots, removes cancelled queued work and prioritizes foreground work', async () => {
		const controller = new AbortController();
		const scope = { accountId: 'test', generation: 1, signal: controller.signal };
		const gates = Array.from({ length: 4 }, deferred);
		let running = 0;
		let maximum = 0;
		const started: string[] = [];
		const initial = gates.map((gate, index) => runRead(scope, async () => {
			running++; maximum = Math.max(maximum, running); started.push(`initial${index}`);
			try { return await gate.promise; } finally { running--; }
		}));
		await Promise.resolve();
		const cancelled = new AbortController();
		const removed = runRead(scope, async () => { started.push('cancelled'); return 0; }, cancelled.signal);
		const removedResult = expect(removed).rejects.toMatchObject({ name: 'AbortError' });
		const background = runRead(scope, async () => { started.push('background'); return 0; }, undefined, 'background');
		const foreground = runRead(scope, async () => { started.push('foreground'); return 0; });
		cancelled.abort();
		await removedResult;
		expect(started).toEqual(['initial0', 'initial1', 'initial2', 'initial3']);
		gates[0].resolve(0);
		await foreground;
		expect(started.indexOf('foreground')).toBeLessThan(started.indexOf('background') < 0 ? Infinity : started.indexOf('background'));
		for (const gate of gates) gate.resolve(0);
		await Promise.all([...initial, background]);
		expect(maximum).toBe(4);
		expect(started).not.toContain('cancelled');
	});

	it('does not release a cancelled in-flight RPC slot before transport settlement', async () => {
		const account = new AbortController();
		const scope = { accountId: 'test', generation: 2, signal: account.signal };
		const signals = Array.from({ length: 4 }, () => new AbortController());
		const gates = Array.from({ length: 4 }, deferred);
		const active = gates.map((gate, index) => runRead(scope, () => gate.promise, signals[index].signal));
		const outcomes = active.map((promise) => promise.catch((error: Error) => error.name));
		await Promise.resolve();
		signals[0].abort();
		let nextStarted = false;
		const next = runRead(scope, async () => { nextStarted = true; return 1; });
		await Promise.resolve();
		expect(nextStarted).toBe(false);
		gates[0].resolve(0);
		await next;
		for (const gate of gates) gate.resolve(0);
		expect((await Promise.all(outcomes))[0]).toBe('AbortError');
	});
});
