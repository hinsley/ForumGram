import { assertAccountScope, type AccountScope } from '@lib/accountScope';

type Entry = { start: () => void; cancel: () => void; priority: 'foreground' | 'background' };
const queue: Entry[] = [];
let active = 0;
const MAX_ACTIVE = 4;
const abortError = () => new DOMException('Request cancelled', 'AbortError');

function drain() {
	while (active < MAX_ACTIVE && queue.length) {
		const foreground = queue.findIndex((entry) => entry.priority === 'foreground');
		queue.splice(foreground < 0 ? 0 : foreground, 1)[0].start();
	}
}

/** Limits RPCs, not whole workflows. Never nest runRead inside its task.
 * An already-sent RPC retains its slot until it settles; cancellation discards its result.
 * GramJS owns transport retries/flood handling; this queue never retries requests.
 */
export function runRead<T>(scope: AccountScope, task: () => Promise<T>, signal?: AbortSignal, priority: 'foreground' | 'background' = 'foreground'): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let started = false;
		let cancelled = false;
		const cleanup = () => {
			scope.signal.removeEventListener('abort', cancel);
			signal?.removeEventListener('abort', cancel);
		};
		const cancel = () => {
			cancelled = true;
			if (!started) {
				const index = queue.indexOf(entry);
				if (index >= 0) queue.splice(index, 1);
				cleanup();
				reject(abortError());
			}
		};
		const entry: Entry = {
			priority, cancel,
			start: () => {
				started = true;
				active++;
				Promise.resolve().then(() => {
					assertAccountScope(scope);
					if (cancelled || signal?.aborted) throw abortError();
					return task();
				}).then((value) => {
					assertAccountScope(scope);
					if (cancelled || signal?.aborted) throw abortError();
					resolve(value);
				}).catch(reject).finally(() => {
					cleanup();
					active--;
					drain();
				});
			},
		};
		try { assertAccountScope(scope); } catch (error) { reject(error); return; }
		if (signal?.aborted) { reject(abortError()); return; }
		scope.signal.addEventListener('abort', cancel, { once: true });
		signal?.addEventListener('abort', cancel, { once: true });
		queue.push(entry);
		drain();
	});
}
