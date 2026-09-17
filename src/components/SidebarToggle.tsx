import { useUiStore } from '@state/ui';

export default function SidebarToggle() {
	const { isSidebarCollapsed, toggleSidebar } = useUiStore();
	return (
		<button className="btn sidebar-toggle" onClick={toggleSidebar} aria-expanded={!isSidebarCollapsed} aria-label={isSidebarCollapsed ? 'Expand forum navigation' : 'Collapse forum navigation'}>
			<span aria-hidden="true">{isSidebarCollapsed ? '›' : '‹'}</span><span className="sidebar-toggle-label">Forums</span>
		</button>
	);
}
