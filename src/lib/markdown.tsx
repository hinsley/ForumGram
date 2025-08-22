import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useSettingsStore } from '@state/settings';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface MarkdownViewProps {
	text: string;
	className?: string;
}

export default function MarkdownView({ text, className }: MarkdownViewProps) {
	const { markdownEnabled, katexEnabled, imageMaxWidthPx } = useSettingsStore();
	if (!markdownEnabled) {
		return <pre className={className}>{text}</pre>;
	}
	// Preserve math classes through sanitization so rehype-katex can detect them.
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
				['className', 'math', 'math-inline'],
				// allow highlight.js token classes.
				['className', /^hljs.*$/]
			]
			,
			code: [
				...((defaultSchema as any).attributes?.code || []),
				// allow language and hljs classes on code.
				['className', 'hljs', /^language[-_a-z0-9]+$/, 'inline-code']
			],
			pre: [
				...((defaultSchema as any).attributes?.pre || []),
				['className', 'hljs', /^language[-_a-z0-9]+$/]
			],
			img: [
				...((defaultSchema as any).attributes?.img || []),
				['className'],
				['style']
			]
		}
	};
	const rehypePlugins: any[] = [[rehypeSanitize, sanitizeOptions], rehypeHighlight];
	if (katexEnabled) rehypePlugins.push(rehypeKatex as any);
	return (
		<div className={`md ${className ?? ''}`}>
			<ReactMarkdown
				rehypePlugins={rehypePlugins}
				remarkPlugins={[remarkGfm, remarkMath]}
									components={{
												code({ node, inline, className, children, ...props }: any) {
							const match = /language-([\w-]+)/.exec(className || '');
							const codeText = String(children ?? '');
							const hasNewline = codeText.includes('\n');
							const hasLanguage = Boolean(match && match[1]);
							if (inline || !hasNewline) {
								return (
									<code className="inline-code" {...props}>{children}</code>
								);
							}
							const language = match?.[1] || 'text';
							return (
								<div className="code-block">
									<div className="code-lang">{language}</div>
									<pre className={className}>
										<code className={className} {...props}>{children}</code>
									</pre>
								</div>
							);
						},
					img({ node, ...props }: any) {
						const style = {
							maxWidth: `${imageMaxWidthPx}px`,
							height: 'auto',
							objectFit: 'contain',
						} as React.CSSProperties;
						return <img {...props} style={style} />;
					}
				}}
			>
				{text}
			</ReactMarkdown>
		</div>
	);
}