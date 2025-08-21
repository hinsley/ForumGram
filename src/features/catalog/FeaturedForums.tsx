import { useEffect, useState } from 'react';
import featured from './featured-forums.json';
import { getForumAvatarUrl } from '@lib/telegram/client';

interface FeaturedForum { address: string; name: string; description: string; }

export default function FeaturedForums({ onSelect }: { onSelect: (address: string) => void }) {
	const items = (featured as FeaturedForum[]);
	const [avatarByAddress, setAvatarByAddress] = useState<Record<string, string | undefined>>({});

	useEffect(() => {
		let canceled = false;
		(async () => {
			// We do not know forum id upfront; try resolving by triggering a lightweight joinPublicByUsername in parent before navigation is not ideal.
			// Instead, attempt best-effort: strip @ and resolve via client.getEntity; if success, fetch photo.
			try {
				const { getClient } = await import('@lib/telegram/client');
				const client = await getClient();
				const entries: Array<[string, string | undefined]> = [];
				for (const f of items) {
					const handle = f.address.startsWith('@') ? f.address.slice(1) : f.address;
					try {
						const res: any = await client.invoke(new (await import('telegram')).Api.contacts.ResolveUsername({ username: handle }));
						const channel = (res?.chats ?? []).find((c: any) => c.className === 'Channel' || c._ === 'channel' || c._ === 'Channel');
						if (channel) {
							const url = await getForumAvatarUrl(Number(channel.id), channel.accessHash);
							entries.push([f.address, url]);
						} else {
							entries.push([f.address, undefined]);
						}
					} catch {
						entries.push([f.address, undefined]);
					}
				}
				if (!canceled) setAvatarByAddress(Object.fromEntries(entries));
			} catch {}
		})();
		return () => { canceled = true; };
	}, [items.map(i => i.address).join(',')]);
	return (
		<div className="col">
			<h4>Featured forums</h4>
			<div className="gallery">
				{items.map((f) => (
					<div key={f.address} className="chiclet" onClick={() => onSelect(f.address)}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<div style={{ width: 36, height: 36, borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--avatar-bg)' }}>
								{avatarByAddress[f.address] ? (
									<img src={avatarByAddress[f.address]} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
								) : null}
							</div>
							<div>
								<div className="title">{f.name}</div>
								<div className="sub">{f.address}</div>
							</div>
						</div>
						<p style={{ margin: 0 }}>{f.description}</p>
					</div>
				))}
			</div>
		</div>
	);
}

