export function formatTimeSince(epochSeconds?: number, nowMs?: number): string {
	if (!epochSeconds || epochSeconds <= 0) return '';
	const now = typeof nowMs === 'number' ? nowMs : Date.now();
	const thenMs = epochSeconds * 1000;
	let diffSec = Math.floor((now - thenMs) / 1000);
	if (diffSec < 0) diffSec = 0;
	if (diffSec < 1) return 'just now';

	const units: { name: string; seconds: number }[] = [
		{ name: 'year', seconds: 365 * 24 * 60 * 60 },
		{ name: 'month', seconds: 30 * 24 * 60 * 60 },
		{ name: 'week', seconds: 7 * 24 * 60 * 60 },
		{ name: 'day', seconds: 24 * 60 * 60 },
		{ name: 'hour', seconds: 60 * 60 },
		{ name: 'minute', seconds: 60 },
		{ name: 'second', seconds: 1 },
	];

	for (const u of units) {
		const amount = Math.floor(diffSec / u.seconds);
		if (amount >= 1) {
			const label = amount === 1 ? u.name : `${u.name}s`;
			return `${amount} ${label} ago`;
		}
	}
	return 'just now';
}

