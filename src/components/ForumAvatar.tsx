import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getClient } from '@lib/telegram/client';
import { getInputPeerForForumId } from '@lib/telegram/peers';

type ForumAvatarProps = {
\tforumId?: number;
\tusername?: string; // without leading @ preferred, but @ is tolerated
\tsize?: number; // pixels
\tclassName?: string;
\ttitle?: string; // used for fallback initial
\tstyle?: CSSProperties;
};

export default function ForumAvatar({ forumId, username, size = 32, className, title, style }: ForumAvatarProps) {
\tconst normalizedHandle = useMemo(() => {
\t\tif (!username) return undefined;
\t\tconst s = username.trim();
\t\treturn s.startsWith('@') ? s.slice(1) : s;
\t}, [username]);

\tconst { data: blob, isFetching } = useQuery<Blob | null>({
\t\tqueryKey: forumId ? ['forum-avatar', forumId] : ['forum-avatar-handle', normalizedHandle ?? ''],
\t\tqueryFn: async () => {
\t\t\ttry {
\t\t\t\tconst client = await getClient();
\t\t\t\tlet entity: any = null;
\t\t\t\tif (typeof forumId === 'number') {
\t\t\t\t\tconst input = getInputPeerForForumId(forumId);
\t\t\t\t\ttry { entity = await (client as any).getEntity(input as any); } catch {}
\t\t\t\t} else if (normalizedHandle) {
\t\t\t\t\ttry { entity = await (client as any).getEntity(normalizedHandle); } catch {}
\t\t\t\t}
\t\t\t\tif (!entity) return null;
\t\t\t\ttry {
\t\t\t\t\tconst data: any = await (client as any).downloadProfilePhoto(entity);
\t\t\t\t\tif (!data) return null;
\t\t\t\t\treturn data instanceof Blob ? data : new Blob([data]);
\t\t\t\t} catch {
\t\t\t\t\treturn null;
\t\t\t\t}
\t\t\t} catch {
\t\t\t\treturn null;
\t\t\t}
\t\t},
\t\tenabled: Boolean((typeof forumId === 'number' && forumId) || normalizedHandle),
\t\tstaleTime: 5 * 60 * 1000,
\t\tgcTime: 10 * 60 * 1000,
\t});

\tconst [objectUrl, setObjectUrl] = useState<string | null>(null);
\tuseEffect(() => {
\t\tif (!blob) {
\t\t\tsetObjectUrl((prev) => {
\t\t\t\tif (prev) URL.revokeObjectURL(prev);
\t\t\t\treturn null;
\t\t\t});
\t\t\treturn;
\t\t}
\t\tconst url = URL.createObjectURL(blob);
\t\tsetObjectUrl((prev) => {
\t\t\tif (prev) URL.revokeObjectURL(prev);
\t\t\treturn url;
\t\t});
\t\treturn () => { URL.revokeObjectURL(url); };
\t}, [blob]);

\tconst fallbackInitial = useMemo(() => {
\t\tconst base = title || normalizedHandle || (typeof forumId === 'number' ? String(forumId) : '');
\t\tconst ch = (base || '').trim().charAt(0).toUpperCase();
\t\treturn ch || '?';
\t}, [title, normalizedHandle, forumId]);

\treturn (
\t\t<div
\t\t\tclassName={className}
\t\t\tstyle={{
\t\t\t\twidth: size,
\t\t\t\theight: size,
\t\t\t\tborderRadius: size / 2,
\t\t\t\toverflow: 'hidden',
\t\t\t\tbackground: 'linear-gradient(135deg, #1e293b, #0b1220)',
\t\t\t\tdisplay: 'inline-flex',
\t\t\t\talignItems: 'center',
\t\t\t\tjustifyContent: 'center',
\t\t\t\tborder: '1px solid var(--border)',
\t\t\t\tflex: '0 0 auto',
\t\t\t\tuserSelect: 'none',
\t\t\t\t...style,
\t\t\t}}
\t\t\ttitle={title || (normalizedHandle ? `@${normalizedHandle}` : undefined)}
\t\t>
\t\t\t{objectUrl ? (
\t\t\t\t<img src={objectUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
\t\t\t) : (
\t\t\t\t<span style={{ fontSize: Math.max(10, Math.floor(size * 0.45)), color: 'var(--muted)' }}>
\t\t\t\t\t{isFetching ? ' ' : fallbackInitial}
\t\t\t\t</span>
\t\t\t)}
\t\t</div>
\t);
}

