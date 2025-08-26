import MarkdownView from '@lib/markdown';
import { format } from 'date-fns';
import { useState } from 'react';



export interface DisplayMessage {
	id: number;
	from?: string;
	date: number; // epoch seconds
	text: string;
	threadId?: string | null;
	avatarUrl?: string;
	activityCount?: number;
	canEdit?: boolean;
	canDelete?: boolean;
    cardId?: string;
    authorUserId?: number;
	forumId?: number;
}
        
export default function MessageItem({ msg, canEdit, canDelete, onEdit, onDelete }: { msg: DisplayMessage; canEdit?: boolean; canDelete?: boolean; onEdit?: (msg: DisplayMessage) => void; onDelete?: (msg: DisplayMessage) => void; }) {
	const dateObj = new Date(msg.date * 1000);
	const datePart = format(dateObj, 'd MMMM yyyy');
	const timePart = format(dateObj, 'h:mm a').replace(' ', '').toLowerCase();
	const postedAt = `${datePart} at ${timePart}`;



	const [menuOpen, setMenuOpen] = useState(false);



	return (
		<div className="forum-post">
			<div className="post-author">
				{msg.avatarUrl ? (
					<img className="avatar" src={msg.avatarUrl} alt="avatar" />
				) : (
					<div className="avatar placeholder" />
				)}
				<div className="author-name">{msg.from ?? 'unknown'}</div>
				{typeof msg.activityCount === 'number' && (
					<div className="author-activity">Activity: {msg.activityCount}</div>
				)}
			</div>
			<div className="post-body" style={{ position: 'relative' }}>
				{(canEdit || canDelete) && (
					<div style={{ position: 'absolute', top: 8, right: 8 }} onClick={(e) => e.stopPropagation()}>
						<button className="btn ghost" onClick={() => setMenuOpen((v) => !v)} title="More">⋯</button>
						{menuOpen && (
							<div style={{ position: 'absolute', top: 36, right: 0, zIndex: 5 }}>
								<div className="card" style={{ padding: 8, minWidth: 180 }}>
									<div className="col" style={{ gap: 6 }}>
										{canEdit && (
											<button className="btn" onClick={() => { setMenuOpen(false); onEdit?.(msg); }}>Edit</button>
										)}
										{canDelete && (
											<button className="btn" style={{ background: 'transparent', color: 'var(--danger)' }} onClick={() => { setMenuOpen(false); onDelete?.(msg); }}>Delete</button>
										)}
									</div>
								</div>
							</div>
						)}
					</div>
				)}
				<div className="post-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
					<div>Posted {postedAt}</div>
				</div>
	            <div className="post-content"><MarkdownView text={msg.text} forumId={msg.forumId} debugId={msg.id} /></div>
			</div>
		</div>
	);
}
