import { useEffect, useState } from 'react';
import { resolveForum } from '@lib/telegram/client';
import { useForumsStore } from '@state/forums';
import { useNavigate } from 'react-router-dom';
import ForumList from '@components/ForumList';

export default function DiscoverPage() {
	const [query, setQuery] = useState('');
	const [result, setResult] = useState<any | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const addOrUpdateForum = useForumsStore((s) => s.addOrUpdateForum);
	const forumCount = useForumsStore((s) => Object.keys(s.forums).length);
	const initForums = useForumsStore((s) => s.initFromStorage);
	const navigate = useNavigate();

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

	return (
		<div className="content">
			<aside className="sidebar">
				<div className="col">
					<ForumList />
					{forumCount > 0 && <div className="hr" />}
					<div className="field">
						<label className="label">Forum handle or invite</label>
						<div className="form-row">
							<input className="input" placeholder="@my_forum" value={query} onChange={(e) => setQuery(e.target.value)} />
							<button className="btn primary" onClick={onResolve} disabled={!query || loading}>Resolve</button>
						</div>
					</div>
					{error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
				</div>
			</aside>
			<main className="main">
				<div className="card" style={{ padding: 12 }}>
					<h3>Result</h3>
					{result ? (
						<div className="col">
							<pre style={{ overflow: 'auto', maxHeight: 320 }}>{JSON.stringify(result, null, 2)}</pre>
							<button className="btn" onClick={onOpen}>Open forum</button>
						</div>
					) : (
						<p>No result yet</p>
					)}
				</div>
			</main>
		</div>
	);
}