import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getClient } from '@lib/telegram/client';
import { getInputPeerForForumId } from '@lib/telegram/peers';
import { Api } from 'telegram';
import { useSessionStore } from '@state/session';

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

export default function ForumAvatar(props: ForumAvatarProps) {
	const { forumId, address, size = 28, alt, className, style, enableRemote = true } = props;
	const [url, setUrl] = useState<string | null>(null);
	const cleanupUrlRef = useRef<string | null>(null);
	const isAuthenticated = useSessionStore((s) => s.isAuthenticated);

	const normalizedHandle = useMemo(() => {
		if (!address) return undefined;
		return address.startsWith('@') ? address.slice(1) : address;
	}, [address]);

	useEffect(() => {
		let canceled = false;
		(async () => {
			try {
				if (!enableRemote) { setUrl(null); return; }
				if (typeof forumId !== 'number' && !normalizedHandle) {
					setUrl(null);
					return;
				}
				if (typeof forumId === 'number') {
					const cached = inMemoryUrlCacheByForumId.get(forumId);
					if (cached) { setUrl(cached); return; }
					const client = await getClient();
					let entity: any = null;
					try {
						const input = getInputPeerForForumId(forumId);
						entity = await (client as any).getEntity(input);
					} catch {}
					if (!entity) { setUrl(null); return; }
					try {
						const data: any = await (client as any).downloadProfilePhoto(entity);
						if (!data) { setUrl(null); return; }
						const blob = data instanceof Blob ? data : new Blob([data]);
						const objectUrl = URL.createObjectURL(blob);
						inMemoryUrlCacheByForumId.set(forumId, objectUrl);
						cleanupUrlRef.current = objectUrl;
						if (!canceled) setUrl(objectUrl);
					} catch {
						setUrl(null);
					}
					return;
				}

				if (normalizedHandle) {
					// If not logged in, skip handle-based profile fetch to avoid crashing on discover page.
					if (!isAuthenticated) { setUrl(null); return; }
					const cacheKey = normalizedHandle.toLowerCase();
					const cached = inMemoryUrlCacheByHandle.get(cacheKey);
					if (cached) { setUrl(cached); return; }
					const client = await getClient();
					let entity: any = null;
					try {
						const res: any = await client.invoke(new Api.contacts.ResolveUsername({ username: normalizedHandle } as any));
						const channel = (res?.chats ?? []).find((c: any) => c.className === 'Channel' || c._ === 'channel' || c._ === 'Channel');
						const chat = (res?.chats ?? []).find((c: any) => c.className === 'Chat' || c._ === 'chat');
						entity = channel || chat || null;
					} catch {}
					if (!entity) { setUrl(null); return; }
					try {
						const data: any = await (client as any).downloadProfilePhoto(entity);
						if (!data) { setUrl(null); return; }
						const blob = data instanceof Blob ? data : new Blob([data]);
						const objectUrl = URL.createObjectURL(blob);
						inMemoryUrlCacheByHandle.set(cacheKey, objectUrl);
						cleanupUrlRef.current = objectUrl;
						if (!canceled) setUrl(objectUrl);
					} catch {
						setUrl(null);
					}
				}
			} catch {
				setUrl(null);
			}
		})();
		return () => {
			canceled = true;
		};
	}, [forumId, normalizedHandle, isAuthenticated, enableRemote]);

	const dimensionStyle: CSSProperties = useMemo(() => ({ width: size, height: size }), [size]);

	if (url) {
		return (
			<img
				src={url}
				alt={alt || ''}
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