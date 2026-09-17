import { useEffect, useRef, useState } from 'react';
import { joinInviteLink, joinPublicByUsername } from '@lib/telegram/client';
import { Api } from 'telegram';
import { assertAccountScope, captureAccountScope } from '@lib/accountScope';
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
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const addMode = searchParams.get('add') === '1';
	const { isSidebarCollapsed } = useUiStore();

	const mounted = useRef(false);
	useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

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

	async function join(address: string) {
		const scope = captureAccountScope();
		try {
			setLoading(true); setError(null);
			const kind = classifyInput(address.trim());
			let entity: Api.Channel | Api.Chat | undefined;
			if (kind.kind === 'username') entity = await joinPublicByUsername(kind.value, scope);
			else {
				const updates = await joinInviteLink(kind.value, scope);
				if ('chats' in updates) entity = updates.chats.find((chat): chat is Api.Channel | Api.Chat => chat instanceof Api.Channel || chat instanceof Api.Chat);
			}
			assertAccountScope(scope);
			if (!entity) throw new Error('Joined, but Telegram returned no accessible chat.');
			const id = Number(entity.id);
			const username = entity instanceof Api.Channel ? entity.username : undefined;
			addOrUpdateForum({ id, title: entity.title || username || `Forum ${id}`, username, accessHash: entity instanceof Api.Channel ? entity.accessHash?.toString() : undefined, isForum: entity instanceof Api.Channel && Boolean(entity.forum), isPublic: Boolean(username) }, scope);
			if (mounted.current) navigate(`/forum/${id}`);
		} catch (error) {
			if (!scope.signal.aborted && mounted.current) setError(error instanceof Error ? error.message : 'Failed to join forum');
		} finally {
			if (!scope.signal.aborted && mounted.current) setLoading(false);
		}
	}
	const onJoin = () => join(query);
	const onSelectFeatured = (address: string) => join(address);

	return (
		<div className={`content${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
			<aside className="sidebar" style={isSidebarCollapsed ? { padding: 0, borderRight: 'none', overflow: 'hidden' } : undefined}>
				<div className="col" style={isSidebarCollapsed ? { display: 'none' } : undefined}>
					<ForumList />
				</div>
			</aside>
			<SidebarToggle />
			<main className="main discover-page">
				<header className="page-heading">
					<p className="eyebrow">YOUR COMMUNITY WORKSPACE</p>
					<h1>{addMode ? 'Find your people.' : 'Welcome back.'}</h1>
					<p>{addMode ? 'Bring a Telegram community into a more focused space.' : 'Pick up a conversation, explore a community, or make room for a new one.'}</p>
				</header>
				<section className="card join-card" aria-labelledby="join-title">
					<div><span className="eyebrow">CONNECT A COMMUNITY</span><h2 id="join-title">Join a forum</h2><p className="muted">Have an invite? Your next conversation starts here.</p></div>
					<form className="field" onSubmit={(event) => { event.preventDefault(); if (!loading && query.trim()) void onJoin(); }}>
						<label className="label" htmlFor="forum-address">Telegram handle or invite link</label>
						<div className="form-row">
							<input id="forum-address" className="input" placeholder="@community or https://t.me/+invite" value={query} onChange={(e) => setQuery(e.target.value)} required />
							<button className="btn primary" type="submit" disabled={!query.trim() || loading}>{loading ? 'Joining…' : 'Join forum'}</button>
						</div>
					</form>
					{error && <div className="alert" role="alert">{error}</div>}
				</section>
				<section className="discover-featured" aria-label="Featured communities">
					<FeaturedForums onSelect={onSelectFeatured} />
				</section>
				<div className="workspace-note"><span className="note-mark" aria-hidden="true">↳</span><p><strong>A home for longer conversations.</strong><br />Open a forum to browse its boards and follow individual discussion threads.</p></div>
			</main>
		</div>
	);
}
