import { useEffect, useState } from 'react';
import { resolveForum } from '@lib/telegram/client';
import { useForumsStore } from '@state/forums';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ForumList from '@components/ForumList';
import FeaturedForums from '@features/catalog/FeaturedForums';
import { useUiStore } from '@state/ui';

export default function DiscoverPage() {
	const [query, setQuery] = useState('');
	const [result, setResult] = useState<any | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const addOrUpdateForum = useForumsStore((s) => s.addOrUpdateForum);
	const initForums = useForumsStore((s) => s.initFromStorage);
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const addMode = searchParams.get('add') === '1';
	const { isSidebarCollapsed, toggleSidebar } = useUiStore();

	useEffect(() => { initForums(); }, [initForums]);

	async function onResolve() {
		try {
			setLoading(true);
			setError(null);
			const input = query.trim();
			const handle = input.startsWith('@') ? input.slice(1) : input;
			const res: any = await resolveForum('@' + handle);
			setResult(res);
			// Attempt to locate chat/channel info.
			const channel = (res.chats ?? []).find((c: any) => c.className === 'Channel' || c._ === 'channel' || c._ === 'Channel');
			const chat = (res.chats ?? []).find((c: any) => c.className === 'Chat' || c._ === 'chat');
			if (channel) {
				addOrUpdateForum({ id: Number(channel.id), title: channel.title, username: handle, accessHash: channel.accessHash, isForum: Boolean(channel.forum), isPublic: Boolean(channel.username) });
			} else if (chat) {
				addOrUpdateForum({ id: Number(chat.id), title: chat.title, username: handle, accessHash: undefined, isForum: false, isPublic: Boolean(handle) });
			}
		} catch (e: any) {
			setError(e?.message ?? 'Failed to resolve');
		} finally { setLoading(false); }
	}

	function onOpen() {
		try {
			const channel = (result?.chats ?? []).find((c: any) => c.className === 'Channel' || c._ === 'channel' || c._ === 'Channel');
			const chat = (result?.chats ?? []).find((c: any) => c.className === 'Chat' || c._ === 'chat');
			const id = channel ? Number(channel.id) : (chat ? Number(chat.id) : null);
			if (!id) throw new Error('No suitable chat in result');
			navigate(`/forum/${id}`);
		} catch (e: any) {
			setError(e?.message ?? 'Cannot open forum');
		}
	}

	async function onSelectFeatured(address: string) {
		try {
			setError(null);
			setLoading(true);
			const handle = address.startsWith('@') ? address.slice(1) : address;
			const res: any = await resolveForum('@' + handle);
			const channel = (res.chats ?? []).find((c: any) => c.className === 'Channel' || c._ === 'channel' || c._ === 'Channel');
			const chat = (res.chats ?? []).find((c: any) => c.className === 'Chat' || c._ === 'chat');
			const id = channel ? Number(channel.id) : (chat ? Number(chat.id) : null);
			if (!id) throw new Error('No suitable chat in result');
			if (channel) {
				addOrUpdateForum({ id, title: channel.title, username: handle, accessHash: channel.accessHash, isForum: Boolean(channel.forum), isPublic: Boolean(channel.username) });
			} else if (chat) {
				addOrUpdateForum({ id, title: chat.title, username: handle, accessHash: undefined, isForum: false, isPublic: Boolean(handle) });
			}
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
				<button
					className="btn ghost"
					onClick={toggleSidebar}
					title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					style={{ position: 'fixed', top: '50%', transform: 'translateY(-50%)', left: isSidebarCollapsed ? 8 : 268, padding: 6, zIndex: 20 }}
				>
					{isSidebarCollapsed ? '▶' : '◀'}
				</button>
				<div className="col" style={isSidebarCollapsed ? { display: 'none' } : undefined}>
					<ForumList />
				</div>
			</aside>
			<main className="main">
				{addMode ? (
					<div className="col">
						<div className="card" style={{ padding: 12 }}>
							<h3>Join a forum</h3>
							<div className="field">
								<label className="label">Forum handle or invite</label>
								<div className="form-row">
									<input className="input" placeholder="@my_forum" value={query} onChange={(e) => setQuery(e.target.value)} />
									<button className="btn primary" onClick={onResolve} disabled={!query || loading}>Resolve</button>
								</div>
							</div>
							{error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
							{result && (
								<div className="col" style={{ marginTop: 8 }}>
									<pre style={{ overflow: 'auto', maxHeight: 320 }}>{JSON.stringify(result, null, 2)}</pre>
									<button className="btn" onClick={onOpen}>Open forum</button>
								</div>
							)}
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
