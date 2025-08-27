/**
 * Utility functions for managing Origin Private File System (OPFS) storage.
 */

export interface OPFSUsage {
	totalSize: number;
	fileCount: number;
}

/**
 * Checks if OPFS is supported in the current browser.
 */
export function isOPFSSupported(): boolean {
	return !!(navigator as any).storage && typeof (navigator as any).storage.getDirectory === 'function';
}

/**
 * Calculates the total storage usage of the ForumGram media directory in OPFS.
 */
export async function getOPFSUsage(): Promise<OPFSUsage> {
	if (!isOPFSSupported()) {
		return { totalSize: 0, fileCount: 0 };
	}

	try {
		const root = await (navigator as any).storage.getDirectory();
		const mediaDir = await root.getDirectoryHandle('fg-media', { create: false });

		let totalSize = 0;
		let fileCount = 0;

		for await (const [, handle] of mediaDir.entries()) {
			if (handle.kind === 'file') {
				const file = await handle.getFile();
				totalSize += file.size;
				fileCount++;
			}
		}

		return { totalSize, fileCount };
	} catch (error) {
		// Directory doesn't exist or other error
		console.warn('Failed to get OPFS usage:', error);
		return { totalSize: 0, fileCount: 0 };
	}
}

/**
 * Clears all ForumGram media files from OPFS storage.
 */
export async function clearOPFSStorage(): Promise<void> {
	if (!isOPFSSupported()) {
		throw new Error('OPFS is not supported in this browser');
	}

	try {
		const root = await (navigator as any).storage.getDirectory();
		const mediaDir = await root.getDirectoryHandle('fg-media', { create: false });

		for await (const [name, handle] of mediaDir.entries()) {
			if (handle.kind === 'file') {
				await mediaDir.removeEntry(name);
			}
		}
	} catch (error) {
		console.error('Failed to clear OPFS storage:', error);
		throw new Error('Failed to clear OPFS storage');
	}
}

/**
 * Formats bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KiB', 'MiB', 'GiB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
