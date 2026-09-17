export interface AccountScope {
	accountId: string;
	generation: number;
	signal: AbortSignal;
}

let generation = 0;
let current: AccountScope | null = null;
let controller: AbortController | null = null;
let draining: Promise<void> = Promise.resolve();
const disposers = new Set<(scope: AccountScope) => void | Promise<void>>();
const invalidators = new Set<(remoteLogout: boolean) => void>();

export function onAuthInvalidate(callback: (remoteLogout: boolean) => void): () => void {
	invalidators.add(callback);
	return () => { invalidators.delete(callback); };
}

export function abortError(): DOMException {
	return new DOMException('This account operation is no longer active.', 'AbortError');
}

export function getAccountGeneration(): number { return generation; }

export function assertAccountGeneration(expected: number): void {
	if (generation !== expected) throw abortError();
}

export function captureAccountScope(): AccountScope {
	if (!current) throw abortError();
	return current;
}

export function assertAccountScope(scope: AccountScope): void {
	if (scope !== current || scope.signal.aborted) throw abortError();
}

export function onAccountDispose(callback: (scope: AccountScope) => void | Promise<void>): () => void {
	disposers.add(callback);
	return () => { disposers.delete(callback); };
}

export function accountQueryKey(scope: AccountScope, ...parts: unknown[]): readonly unknown[] {
	return ['account', scope.accountId, scope.generation, ...parts];
}

// Invalidation is synchronous; cleanup is a barrier, not a promise callers must
// await before the old account loses access.
export function invalidateAccount(remoteLogout = false): Promise<void> {
	const old = current;
	current = null;
	generation += 1;
	controller?.abort();
	controller = null;
	const pending: Promise<void>[] = [];
	for (const invalidate of invalidators) {
		try { invalidate(remoteLogout); }
		catch (error) { pending.push(Promise.reject(error)); }
	}
	if (old) {
		for (const dispose of disposers) {
			try { pending.push(Promise.resolve(dispose(old))); }
			catch (error) { pending.push(Promise.reject(error)); }
		}
	}
	const previous = draining;
	draining = Promise.allSettled([previous, ...pending]).then((results) => {
		const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
		if (failure) throw failure.reason;
	});
	// Keep rejected cleanup barriers observable to the next account admission,
	// without an unhandled rejection while logged out.
	void draining.catch(() => {});
	return draining;
}

export async function activateAccount(accountId: string, expectedGeneration: number): Promise<AccountScope> {
	await draining;
	assertAccountGeneration(expectedGeneration);
	if (current) throw new Error('An account is already active.');
	controller = new AbortController();
	current = Object.freeze({ accountId, generation, signal: controller.signal });
	return current;
}

export async function waitForAccountDisposal(expectedGeneration: number): Promise<void> {
	await draining;
	assertAccountGeneration(expectedGeneration);
}
