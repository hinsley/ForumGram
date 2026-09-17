import { useSettingsStore } from '@state/settings';
import { useState, useEffect } from 'react';
import { formatBytes } from '@lib/opfs';
import { clearResourceCache, getResourceCacheUsage } from '@lib/resourceCache';
import { captureAccountScope, assertAccountScope } from '@lib/accountScope';

export default function SettingsPage() {
	const { markdownEnabled, katexEnabled, forumSecret, imageMaxWidthPx, theme, setMarkdown, setKatex, setForumSecret, setImageMaxWidthPx, setTheme } = useSettingsStore();

	const [opfsUsage, setOpfsUsage] = useState<{ totalSize: number; fileCount: number } | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isClearing, setIsClearing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const opfsSupported = typeof indexedDB !== 'undefined';

	useEffect(() => {
		if (opfsSupported) {
			loadOPFSUsage();
		}
	}, [opfsSupported]);

	const loadOPFSUsage = async () => {
		try {
			setIsLoading(true);
			setError(null);
			const scope = captureAccountScope();
			const usage = await getResourceCacheUsage(scope);
			assertAccountScope(scope);
			setOpfsUsage(usage);
		} catch (err) {
			setOpfsUsage(null);
			setError('Cached media usage is unknown. You can still try clearing it.');
		} finally {
			setIsLoading(false);
		}
	};

	const handleClearStorage = async () => {
		try {
			setIsClearing(true);
			setError(null);
			setSuccess(null);
			const scope = captureAccountScope();
			await clearResourceCache(scope);
			assertAccountScope(scope);
			await loadOPFSUsage();
			setSuccess('This account’s cached media and avatars were cleared. Other app data was kept.');
		} catch (err) {
			setError('Could not finish clearing cached media. Some browser storage may remain; retry clearing.');
		} finally {
			setIsClearing(false);
		}
	};
	return (
		<div className="content" style={{ gridTemplateColumns: '1fr' }}>
			<main className="main">
				<div className="settings-page">
					<header className="page-heading">
						<div className="eyebrow">Preferences</div>
						<h1>Settings</h1>
						<p>Tune how posts render, pick a theme, and manage the media this app caches on your device.</p>
					</header>

					<section className="card settings-card" aria-labelledby="settings-reading-heading">
						<h2 className="section-heading" id="settings-reading-heading">Reading &amp; appearance</h2>
						<div className="col">
							<label className="row" htmlFor="settings-markdown">
								<input id="settings-markdown" type="checkbox" checked={markdownEnabled} onChange={(e) => setMarkdown(e.target.checked)} />
								<span>Enable Markdown</span>
							</label>
							<label className="row" htmlFor="settings-katex">
								<input id="settings-katex" type="checkbox" checked={katexEnabled} onChange={(e) => setKatex(e.target.checked)} />
								<span>Enable KaTeX</span>
							</label>
							<div className="field">
								<label className="label" htmlFor="settings-forum-secret">Forum secret (for thread tag verification)</label>
								<input
									id="settings-forum-secret"
									className="input"
									type="password"
									value={forumSecret ?? ''}
									onChange={(e) => setForumSecret(e.target.value || null)}
									placeholder="Optional"
									autoComplete="off"
									spellCheck={false}
								/>
							</div>
							<div className="field">
								<label className="label" htmlFor="settings-image-width">Max image width (px)</label>
								<input
									id="settings-image-width"
									className="input"
									placeholder="480"
									inputMode="numeric"
									value={String(imageMaxWidthPx)}
									onChange={(e) => {
										const raw = e.target.value.trim();
										const parsed = parseInt(raw.replace(/[^0-9]/g, ''), 10);
										if (Number.isFinite(parsed)) setImageMaxWidthPx(parsed);
									}}
								/>
							</div>
							<div className="field">
								<label className="label" htmlFor="settings-theme">Theme</label>
								<select id="settings-theme" className="input" value={theme} onChange={(e) => {
									const selectedTheme = e.target.value;
									if (selectedTheme === 'forumgram-blue' || selectedTheme === 'monokai-dimmed' || selectedTheme === 'catppuccin-mocha' || selectedTheme === 'telegram-light') {
										setTheme(selectedTheme);
									}
								}}>
									<option value="forumgram-blue">ForumGram Blue</option>
									<option value="monokai-dimmed">Monokai Dimmed</option>
									<option value="catppuccin-mocha">Catppuccin Mocha</option>
									<option value="telegram-light">Telegram Light</option>
								</select>
							</div>
						</div>
					</section>

					{/* Account-owned media cache management */}
					<section className="card settings-card" aria-labelledby="settings-storage-heading">
						<h2 className="section-heading" id="settings-storage-heading">Storage</h2>
						<div className="col">
							{!opfsSupported ? (
								<p className="label" style={{ color: 'var(--muted)', margin: 0 }}>
									Persistent media caching is unavailable in this browser.
									Downloaded media can still render without persistence.
								</p>
							) : (
								<>
									<p className="label" style={{ color: 'var(--muted)', margin: 0 }}>
									Clearing removes this account’s cached media and avatars, including live image URLs in other open tabs.
									It keeps your session, forum list, preferences, posts and offline app shell. Legacy unowned ForumGram image caches are also discarded.
									</p>
									<div className="field">
										<span className="label" id="settings-opfs-usage-label">Cached media storage</span>
										<div className="row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
											<div className="col" style={{ flex: '1 1 200px', minWidth: 0, gap: 4 }}>
												<div className="label" aria-labelledby="settings-opfs-usage-label" role="status" style={{ color: 'var(--muted)' }}>
													{isLoading ? (
														<span>Loading...</span>
											) : !opfsUsage ? <span>Unknown</span> : (
														<>
															<strong>{formatBytes(opfsUsage.totalSize)}</strong> used
															{opfsUsage.fileCount > 0 && (
																<span> • {opfsUsage.fileCount} file{opfsUsage.fileCount !== 1 ? 's' : ''}</span>
															)}
														</>
													)}
												</div>
												<div className="label" style={{ color: 'var(--muted)' }}>
												Cached media and avatars for this account
												</div>
											</div>
											<button
												className="btn"
												onClick={handleClearStorage}
											disabled={isClearing}
												style={{
													background: 'transparent',
													color: 'var(--danger)',
												opacity: isClearing ? 0.5 : 1
												}}
											>
											{isClearing ? 'Clearing...' : 'Clear media cache'}
											</button>
										</div>
									</div>

									{error && (
										<div className="alert" role="alert" style={{ color: 'var(--danger)' }}>
											{error}
										</div>
									)}

									{success && (
										<div className="alert" role="status" style={{ color: 'var(--success)' }}>
											{success}
										</div>
									)}
								</>
							)}
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
