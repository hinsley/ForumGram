import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import { useSettingsStore } from '@state/settings';
import 'katex/dist/katex.min.css';

interface MarkdownViewProps {
	text: string;
	className?: string;
}

export default function MarkdownView({ text, className }: MarkdownViewProps) {
	const { markdownEnabled, katexEnabled } = useSettingsStore();
	if (!markdownEnabled) {
		return <pre className={className}>{text}</pre>;
	}
	const rehypePlugins: any[] = [rehypeSanitize, rehypeHighlight];
	if (katexEnabled) rehypePlugins.push(rehypeKatex as any);
	return (
		<div className={`md ${className ?? ''}`}>
			<ReactMarkdown rehypePlugins={rehypePlugins} remarkPlugins={[remarkGfm]}>
				{text}
			</ReactMarkdown>
		</div>
	);
}