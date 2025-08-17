import { useSettingsStore } from '@state/settings';

export default function SettingsPage() {
	const { markdownEnabled, katexEnabled, forumSecret, setMarkdown, setKatex, setForumSecret } = useSettingsStore();
	return (
		<div className="content" style={{ gridTemplateColumns: '1fr' }}>
			<main className="main">
				<div className="card" style={{ padding: 12 }}>
					<h3>Settings</h3>
					<div className="col">
						<label className="row">
							<input type="checkbox" checked={markdownEnabled} onChange={(e) => setMarkdown(e.target.checked)} />
							<span>Enable Markdown</span>
						</label>
						<label className="row">
							<input type="checkbox" checked={katexEnabled} onChange={(e) => setKatex(e.target.checked)} />
							<span>Enable KaTeX</span>
						</label>
						<div className="field">
							<label className="label">Forum Secret (for thread tag verification)</label>
							<input className="input" value={forumSecret ?? ''} onChange={(e) => setForumSecret(e.target.value || null)} placeholder="Optional" />
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}