export default function BackupPage() {
	return (
		<div className="content" style={{ gridTemplateColumns: '1fr' }}>
			<main className="main">
				<div className="card" style={{ padding: 12 }}>
					<h3>Backup</h3>
					<p>Export or import local cache and session.</p>
					<div className="row">
						<button className="btn">Export ZIP</button>
						<button className="btn">Import ZIP</button>
					</div>
				</div>
			</main>
		</div>
	);
}