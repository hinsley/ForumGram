// Minimal search worker scaffold
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
self.onmessage = async (ev: MessageEvent) => {
	const { type } = ev.data || {};
	switch (type) {
		default:
			// no-op for now
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			self.postMessage({ type: 'ack' });
	}
};