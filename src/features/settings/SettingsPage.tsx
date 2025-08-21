import { useSettingsStore } from '@state/settings';

export default function SettingsPage() {
	const { markdownEnabled, katexEnabled, forumSecret, imageMaxWidthPx, theme, setMarkdown, setKatex, setForumSecret, setImageMaxWidthPx, setTheme } = useSettingsStore();
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
						<div className="field">
							<label className="label">Max image width (px)</label>
							<input
								className="input"
								placeholder="480"
								value={String(imageMaxWidthPx)}
								onChange={(e) => {
									const raw = e.target.value.trim();
									const parsed = parseInt(raw.replace(/[^0-9]/g, ''), 10);
									if (Number.isFinite(parsed)) setImageMaxWidthPx(parsed);
								}}
							/>
						</div>
						<div className="field">
							<label className="label">Theme</label>
							<select className="input" value={theme} onChange={(e) => setTheme(e.target.value as any)}>
								<option value="forumgram-blue">ForumGram Blue</option>
								<option value="monokai-dimmed">Monokai Dimmed</option>
								<option value="catppuccin-mocha">Catppuccin Mocha</option>
								<option value="telegram-light">Telegram Light</option>
							</select>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}