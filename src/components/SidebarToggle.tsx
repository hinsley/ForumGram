import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useUiStore } from '@state/ui';

export default function SidebarToggle() {
	const { isSidebarCollapsed, toggleSidebar } = useUiStore();
	const [leftPx, setLeftPx] = useState<number>(8);

	const recomputeLeft = useCallback(() => {
		try {
			if (isSidebarCollapsed) {
				setLeftPx(8);
				return;
			}
			const el = document.querySelector('aside.sidebar') as HTMLElement | null;
			if (!el) { setLeftPx(268); return; }
			const rect = el.getBoundingClientRect();
			const candidate = Math.floor(rect.left + rect.width - 12);
			const maxWithinViewport = Math.max(8, Math.min(candidate, window.innerWidth - 44));
			setLeftPx(maxWithinViewport);
		} catch {
			setLeftPx(isSidebarCollapsed ? 8 : 268);
		}
	}, [isSidebarCollapsed]);

	useEffect(() => {
		recomputeLeft();
		const onResize = () => recomputeLeft();
		window.addEventListener('resize', onResize);
		window.addEventListener('orientationchange', onResize as any);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('orientationchange', onResize as any);
		};
	}, [recomputeLeft]);

	useEffect(() => {
		// Recompute after next paint in case layout just changed.
		const id = requestAnimationFrame(() => recomputeLeft());
		return () => cancelAnimationFrame(id);
	}, [isSidebarCollapsed, recomputeLeft]);

	return createPortal(
		<button
			className="btn ghost"
			onClick={toggleSidebar}
			title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			style={{
				position: 'fixed',
				top: '50%',
				transform: 'translateY(-50%)',
				left: leftPx,
				padding: 6,
				zIndex: 2147483647,
				WebkitTapHighlightColor: 'transparent',
			}}
			aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{isSidebarCollapsed ? '▶' : '◀'}
		</button>,
		document.body,
	);
} 