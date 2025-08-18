import { useEffect, useState } from 'react';
import { resolveForum } from '@lib/telegram/client';
import { useForumsStore } from '@state/forums';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ForumList from '@components/ForumList';
import FeaturedForums from '@features/catalog/FeaturedForums';

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

	useEffect(() => { initForums(); }, [initForums]);

	async function onResolve() {
		try {
			setLoading(true);
			setError(null);
			const input = query.trim();
			const handle = input.startsWith('@') ? input.slice(1) : input;
			const res: any = await resolveForum('@' + handle);
			setResult(res);
			// Attempt to locate channel info
			const channel = (res.chats ?? []).find((c: any) => c.className === 'Channel' || c._ === 'channel' || c._ === 'Channel');
			if (channel) {
				addOrUpdateForum({ id: Number(channel.id), title: channel.title, username: handle, accessHash: channel.accessHash, isForum: Boolean(channel.forum), isPublic: Boolean(channel.username) });
			}
		} catch (e: any) {
			setError(e?.message ?? 'Failed to resolve');
		} finally { setLoading(false); }
	}

	function onOpen() {
		try {
			const channel = (result?.chats ?? []).find((c: any) => c.className === 'Channel' || c._ === 'channel' || c._ === 'Channel');
			if (!channel) throw new Error('No channel in result');
			navigate(`/forum/${Number(channel.id)}`);
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
			if (!channel) throw new Error('No channel in result');
			addOrUpdateForum({ id: Number(channel.id), title: channel.title, username: handle, accessHash: channel.accessHash, isForum: Boolean(channel.forum), isPublic: Boolean(channel.username) });
			navigate(`/forum/${Number(channel.id)}`);
		} catch (e: any) {
			setError(e?.message ?? 'Failed to open featured forum');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="content">
			<aside className="sidebar">
				<div className="col">
					<ForumList />
				</div>
			</aside>
			<main className="main">
				{addMode ? (
					<div className="col">
						<div className="card" style={{ padding: 12 }}>
							<h3>Add a forum</h3>
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
						<p>Select a forum from the left, or click + to add a forum.</p>
					</div>
				)}
			</main>
		</div>
	);
}