import { useEffect, useState } from 'react';
import { joinInviteLink } from '@lib/telegram/client';
import { useForumsStore } from '@state/forums';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ForumList from '@components/ForumList';
import FeaturedForums from '@features/catalog/FeaturedForums';
import { useUiStore } from '@state/ui';
import SidebarToggle from '@components/SidebarToggle';

export default function DiscoverPage() {
	const [query, setQuery] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const addOrUpdateForum = useForumsStore((s) => s.addOrUpdateForum);
	const initForums = useForumsStore((s) => s.initFromStorage);
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const addMode = searchParams.get('add') === '1';
	const { isSidebarCollapsed } = useUiStore();

	useEffect(() => { initForums(); }, [initForums]);

	function classifyInput(input: string): { kind: 'invite'|'username'; value: string } {
		const s = input.trim();
		if (s.includes('t.me') || s.includes('telegram.me')) {
			try {
				const url = new URL(s);
				const seg = url.pathname.split('/').filter(Boolean);
				const last = seg[seg.length - 1] ?? '';
				const second = seg[seg.length - 2] ?? '';
				if (second === 'joinchat' || last.startsWith('+')) return { kind: 'invite', value: s };
				return { kind: 'username', value: last };
			} catch {
				const parts = s.split('/').filter(Boolean);
				const last = parts[parts.length - 1] ?? '';
				const second = parts[parts.length - 2] ?? '';
				if (second === 'joinchat' || last.startsWith('+')) return { kind: 'invite', value: s };
				return { kind: 'username', value: last };
			}
		}
		if (s.startsWith('@')) return { kind: 'username', value: s.slice(1) };
		return { kind: 'username', value: s };
	}

	async function onJoin() {
		try {
			setLoading(true);
			setError(null);
			const inputVal = query.trim();
			const kind = classifyInput(inputVal);
			if (kind.kind === 'username') {
				const { joinPublicByUsername } = await import('@lib/telegram/client');
				const ch: any = await joinPublicByUsername(kind.value);
				const id = Number(ch.id);
				const title = ch.title || ch.username || `Forum ${id}`;
				const username = ch.username;
				const accessHash = ch.accessHash ?? ch.access_hash;
				addOrUpdateForum({ id, title, username, accessHash, isForum: Boolean(ch.forum), isPublic: Boolean(username) });
				navigate(`/forum/${id}`);
			} else {
				const updates: any = await joinInviteLink(inputVal);
				const channel = (updates?.chats ?? []).find((c: any) => c.className === 'Channel' || c._ === 'channel' || c._ === 'Channel');
				const chat = (updates?.chats ?? []).find((c: any) => c.className === 'Chat' || c._ === 'chat');
				const entity: any = channel || chat || updates?.chat || null;
				if (!entity) throw new Error('Joined, but no chat found in response');
				const id = Number(entity.id);
				const title = entity.title || entity.username || `Forum ${id}`;
				const username = entity.username;
				const accessHash = entity.accessHash ?? entity.access_hash;
				addOrUpdateForum({ id, title, username, accessHash, isForum: Boolean(entity.forum), isPublic: Boolean(username) });
				navigate(`/forum/${id}`);
			}
		} catch (e: any) {
			setError(e?.message ?? 'Failed to join forum');
		} finally {
			setLoading(false);
		}
	}

	async function onSelectFeatured(address: string) {
		try {
			setError(null);
			setLoading(true);
			const handle = address.startsWith('@') ? address.slice(1) : address;
			const { joinPublicByUsername } = await import('@lib/telegram/client');
			const ch: any = await joinPublicByUsername(handle);
			const id = Number(ch.id);
			const title = ch.title || ch.username || `Forum ${id}`;
			const username = ch.username;
			const accessHash = ch.accessHash ?? ch.access_hash;
			addOrUpdateForum({ id, title, username, accessHash, isForum: Boolean(ch.forum), isPublic: Boolean(username) });
			navigate(`/forum/${id}`);
		} catch (e: any) {
			setError(e?.message ?? 'Failed to open featured forum');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="content" style={{ gridTemplateColumns: isSidebarCollapsed ? '16px 1fr' : undefined }}>
			<aside className="sidebar" style={isSidebarCollapsed ? { padding: 0, borderRight: 'none', overflow: 'hidden' } : undefined}>
				<div className="col" style={isSidebarCollapsed ? { display: 'none' } : undefined}>
					<ForumList />
				</div>
			</aside>
			<SidebarToggle />
			<main className="main">
				{addMode ? (
					<div className="col">
						<div className="card" style={{ padding: 12 }}>
							<h3>Join a forum</h3>
							<div className="field">
								<label className="label">Forum handle or invite</label>
								<div className="form-row">
									<input className="input" placeholder="@my_forum or https://t.me/+hash" value={query} onChange={(e) => setQuery(e.target.value)} />
									<button className="btn primary" onClick={onJoin} disabled={!query || loading}>Join</button>
								</div>
							</div>
							{error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
						</div>
						<div className="card" style={{ padding: 12 }}>
							<FeaturedForums onSelect={onSelectFeatured} />
						</div>
					</div>
				) : (
					<div className="card" style={{ padding: 12 }}>
						<h3>Welcome</h3>
						<p>Select a forum from the left, or click + to join a forum.</p>
					</div>
				)}
			</main>
		</div>
	);
}
