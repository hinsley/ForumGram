import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
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
	// Preserve math classes through sanitization so rehype-katex can detect them
	const sanitizeOptions: any = {
		...defaultSchema,
		attributes: {
			...defaultSchema.attributes,
			div: [
				...((defaultSchema as any).attributes?.div || []),
				['className', 'math', 'math-display']
			],
			span: [
				...((defaultSchema as any).attributes?.span || []),
				['className', 'math', 'math-inline']
			]
		}
	};
	const rehypePlugins: any[] = [[rehypeSanitize, sanitizeOptions], rehypeHighlight];
	if (katexEnabled) rehypePlugins.push(rehypeKatex as any);
	return (
		<div className={`md ${className ?? ''}`}>
			<ReactMarkdown rehypePlugins={rehypePlugins} remarkPlugins={[remarkGfm, remarkMath]}>
				{text}
			</ReactMarkdown>
		</div>
	);
}