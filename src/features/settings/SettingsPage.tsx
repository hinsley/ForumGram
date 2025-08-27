import { useSettingsStore } from '@state/settings';
import { useState, useEffect } from 'react';
import { getOPFSUsage, clearOPFSStorage, formatBytes, isOPFSSupported, type OPFSUsage } from '@lib/opfs';

export default function SettingsPage() {
	const { markdownEnabled, katexEnabled, forumSecret, imageMaxWidthPx, theme, setMarkdown, setKatex, setForumSecret, setImageMaxWidthPx, setTheme } = useSettingsStore();

	const [opfsUsage, setOpfsUsage] = useState<OPFSUsage>({ totalSize: 0, fileCount: 0 });
	const [isLoading, setIsLoading] = useState(false);
	const [isClearing, setIsClearing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const opfsSupported = isOPFSSupported();

	useEffect(() => {
		if (opfsSupported) {
			loadOPFSUsage();
		}
	}, [opfsSupported]);

	const loadOPFSUsage = async () => {
		try {
			setIsLoading(true);
			setError(null);
			const usage = await getOPFSUsage();
			setOpfsUsage(usage);
		} catch (err) {
			setError('Failed to load storage usage');
			console.error('Failed to load OPFS usage:', err);
		} finally {
			setIsLoading(false);
		}
	};

	const handleClearStorage = async () => {
		try {
			setIsClearing(true);
			setError(null);
			setSuccess(null);
			await clearOPFSStorage();
			await loadOPFSUsage(); // Refresh usage after clearing
			setSuccess('Storage cleared successfully');
		} catch (err) {
			setError('Failed to clear storage');
			console.error('Failed to clear OPFS storage:', err);
		} finally {
			setIsClearing(false);
		}
	};
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

				{/* OPFS Storage Management Section */}
				<div className="card" style={{ padding: 12, marginTop: 16 }}>
					<h3>Storage Management</h3>
					<div className="col">
						{!opfsSupported ? (
							<div className="field">
								<p style={{ color: '#666', margin: 0 }}>
									Origin Private File System (OPFS) is not supported in this browser.
									Some features like offline media caching may not work.
								</p>
							</div>
						) : (
							<>
								<div className="field">
									<label className="label">Cached Media Storage</label>
									<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
										<div style={{ flex: 1 }}>
											<div style={{ fontSize: '14px', color: '#666' }}>
												{isLoading ? (
													<span>Loading...</span>
												) : (
													<>
														<strong>{formatBytes(opfsUsage.totalSize)}</strong> used
														{opfsUsage.fileCount > 0 && (
															<span> • {opfsUsage.fileCount} file{opfsUsage.fileCount !== 1 ? 's' : ''}</span>
														)}
													</>
												)}
											</div>
											<div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
												Cached images and media files from posts
											</div>
										</div>
										<button
											className="btn"
											onClick={handleClearStorage}
											disabled={isClearing || opfsUsage.totalSize === 0}
											style={{
												backgroundColor: '#ff4444',
												color: 'white',
												border: 'none',
												padding: '8px 16px',
												borderRadius: '4px',
												cursor: isClearing || opfsUsage.totalSize === 0 ? 'not-allowed' : 'pointer',
												opacity: isClearing || opfsUsage.totalSize === 0 ? 0.5 : 1
											}}
										>
											{isClearing ? 'Clearing...' : 'Clear Storage'}
										</button>
									</div>
								</div>

								{error && (
									<div style={{
										padding: '8px 12px',
										backgroundColor: '#ffebee',
										color: '#c62828',
										borderRadius: '4px',
										marginTop: '8px',
										fontSize: '14px'
									}}>
										{error}
									</div>
								)}

								{success && (
									<div style={{
										padding: '8px 12px',
										backgroundColor: '#e8f5e8',
										color: '#2e7d32',
										borderRadius: '4px',
										marginTop: '8px',
										fontSize: '14px'
									}}>
										{success}
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}