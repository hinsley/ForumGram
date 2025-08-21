import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { fetchForumPhotoObjectUrlByGetFile } from '@lib/telegram/client';
import { Api } from 'telegram';

type ForumAvatarProps = {
	forumId?: number;
	address?: string; // e.g. "@my_forum"
	size?: number;
	alt?: string;
	className?: string;
	style?: CSSProperties;
	enableRemote?: boolean; // when false, will not attempt to fetch remotely
};

const inMemoryUrlCacheByForumId: Map<number, string> = new Map();
const inMemoryUrlCacheByHandle: Map<string, string> = new Map();

function isAuthed(): boolean {
	try { return Boolean(localStorage.getItem('tg_session')); } catch { return false; }
}

export default function ForumAvatar(props: ForumAvatarProps) {
	const { forumId, address, size = 28, alt, className, style, enableRemote = true } = props;
	const [url, setUrl] = useState<string | null>(null);
	const cleanupUrlRef = useRef<string | null>(null);

	const normalizedHandle = useMemo(() => {
		if (!address) return undefined;
		return address.startsWith('@') ? address.slice(1) : address;
	}, [address]);

	useEffect(() => {
		let canceled = false;
		(async () => {
			try {
				if (!enableRemote) { setUrl(null); return; }
				if (typeof forumId !== 'number' && !normalizedHandle) { setUrl(null); return; }
				if (typeof forumId === 'number') {
					const cached = inMemoryUrlCacheByForumId.get(forumId);
					if (cached) { setUrl(cached); return; }
					const objectUrl = await fetchForumPhotoObjectUrlByGetFile(forumId);
					if (objectUrl) {
						inMemoryUrlCacheByForumId.set(forumId, objectUrl);
						cleanupUrlRef.current = objectUrl;
						if (!canceled) setUrl(objectUrl);
					} else {
						setUrl(null);
					}
					return;
				}

				if (normalizedHandle) {
					// Handle-based fetch disabled for now; we only support forumId path.
					setUrl(null);
				}
			} catch {
				setUrl(null);
			}
		})();
		return () => { canceled = true; };
	}, [forumId, normalizedHandle, enableRemote]);

	const dimensionStyle: CSSProperties = useMemo(() => ({ width: size, height: size }), [size]);

	if (url) {
		return (
			<img
				src={url}
				alt={alt || ''}
				onError={() => { try { if (url) URL.revokeObjectURL(url); } catch {}; setUrl(null); }}
				className={["forum-avatar", className].filter(Boolean).join(' ')}
				style={{ ...dimensionStyle, ...style }}
			/>
		);
	}

	const initial = useMemo(() => {
		if (alt && alt.trim()) return alt.trim().slice(0, 1).toUpperCase();
		return '';
	}, [alt]);

	return (
		<div
			className={["forum-avatar", "placeholder", className].filter(Boolean).join(' ')}
			style={{ ...dimensionStyle, ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--muted)', fontSize: Math.max(10, Math.floor(size * 0.42)) }}
			aria-hidden={initial ? undefined : true}
		>
			{initial}
		</div>
	);
}