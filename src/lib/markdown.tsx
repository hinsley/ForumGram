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
	const { markdownEnabled, katexEnabled, imageMaxWidthPx } = useSettingsStore();
	if (!markdownEnabled) {
		return (
			<div className={`md ${className ?? ''}`}>
				<div className="code-block">
					<div className="code-lang">text</div>
					<pre>
						<code>{text}</code>
					</pre>
				</div>
			</div>
		);
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
						pre({ children }: any) {
							const child = Array.isArray(children) ? children[0] : children;
							const childProps: any = (child as any)?.props || {};
							const className: string = childProps.className || '';
							const match = /language-([\w-]+)/.exec(className || '');
							const language = match?.[1] || 'text';
							const codeChildren = childProps.children;
							return (
								<div className="code-block">
									<div className="code-lang">{language}</div>
									<pre className={className}>
										<code className={className}>{codeChildren}</code>
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