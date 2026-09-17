// Only the historical, app-owned directory is removed. New blobs live in the
// transactional account cache; no OPFS writers remain after this cutover.
export async function discardLegacyMedia(): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return;
	const root = await navigator.storage.getDirectory();
	try {
		await root.removeEntry('fg-media', { recursive: true });
	} catch (error) {
		if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
	}
}

export function formatBytes(bytes: number): string {
	if (bytes <= 0) return '0 Bytes';
	const units = ['Bytes', 'KiB', 'MiB', 'GiB'];
	const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	return `${Number((bytes / 1024 ** index).toFixed(2))} ${units[index]}`;
}
