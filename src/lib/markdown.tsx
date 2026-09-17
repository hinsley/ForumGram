import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useSettingsStore } from '@state/settings';
import 'katex/dist/katex.min.css';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { captureAccountScope, assertAccountScope, type AccountScope } from './accountScope';
import { getMediaBlob, useBlobUrl } from './resourceCache';

interface MarkdownViewProps { text: string; className?: string; forumId?: number; debugId?: string | number }
const sanitizeOptions = {
	...defaultSchema,
	protocols: { ...defaultSchema.protocols, src: [...(defaultSchema.protocols?.src ?? []), 'tg-media'], href: [...(defaultSchema.protocols?.href ?? []), 'tg-media'] },
	attributes: {
		...defaultSchema.attributes,
		div: [...(defaultSchema.attributes?.div ?? []), ['className', 'math', 'math-display']],
		span: [...(defaultSchema.attributes?.span ?? []), ['className', 'math', 'math-inline'], ['className', /^hljs.*$/]],
		code: [...(defaultSchema.attributes?.code ?? []), ['className', 'hljs', /^language[-_a-z0-9]+$/, 'inline-code']],
		pre: [...(defaultSchema.attributes?.pre ?? []), ['className', 'hljs', /^language[-_a-z0-9]+$/]],
	},
};
const remarkPlugins = [remarkGfm, remarkMath];
const basePlugins = [[rehypeSanitize, sanitizeOptions], rehypeHighlight] satisfies NonNullable<Parameters<typeof ReactMarkdown>[0]['rehypePlugins']>;
const mathPlugins = [...basePlugins, rehypeKatex];
const urlTransform = (url: string) => /^tg-media:\d+$/.test(url) ? url : defaultUrlTransform(url);

function MediaReference({ forumId, messageId, alt, children, width, image }: { forumId?: number; messageId: number; alt?: string; children?: ReactNode; width: number; image: boolean }) {
	const [result, setResult] = useState<{ forumId: number; messageId: number; blob: Blob | null }>();
	useEffect(() => {
		if (forumId === undefined) return;
		let active = true;
		let scope: AccountScope;
		try { scope = captureAccountScope(); } catch { return; }
		getMediaBlob(forumId, messageId, scope).then(blob => {
			assertAccountScope(scope);
			if (active) setResult({ forumId, messageId, blob });
		}).catch(() => { if (active) setResult(undefined); });
		return () => { active = false; };
	}, [forumId, messageId]);
	const url = useBlobUrl(result?.forumId === forumId && result?.messageId === messageId ? result?.blob : undefined);
	if (!url) return <span className="muted" role="status">{alt || children || 'Media'} (unavailable)</span>;
	return image ? <img src={url} alt={alt ?? ''} style={{ maxWidth: width, width: '100%', height: 'auto', display: 'block' }} /> : <a href={url} download>{children || 'Download attachment'}</a>;
}

function MarkdownView({ text, className, forumId }: MarkdownViewProps) {
	const markdownEnabled = useSettingsStore(state => state.markdownEnabled);
	const katexEnabled = useSettingsStore(state => state.katexEnabled);
	const imageMaxWidthPx = useSettingsStore(state => state.imageMaxWidthPx);
	const components = useMemo<Components>(() => ({
		pre({ children }) {
			return <div className="code-block"><pre>{children}</pre></div>;
		},
		img({ src, alt, title }) {
			const match = /^tg-media:(\d+)$/.exec(src ?? '');
			if (match) return <MediaReference forumId={forumId} messageId={Number(match[1])} alt={alt} width={imageMaxWidthPx} image />;
			return <img src={src} alt={alt} title={title} style={{ maxWidth: imageMaxWidthPx, width: '100%', height: 'auto', display: 'block' }} />;
		},
		a({ href, children, title }) {
			const match = /^tg-media:(\d+)$/.exec(href ?? '');
			if (match) return <MediaReference forumId={forumId} messageId={Number(match[1])} width={imageMaxWidthPx} image={false}>{children}</MediaReference>;
			return <a href={href} title={title}>{children}</a>;
		},
	}), [forumId, imageMaxWidthPx]);
	// No media child mounts, parsing, entity reads or downloads in plain-text mode.
	if (!markdownEnabled) return <div className={`md ${className ?? ''}`} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</div>;
	return <div className={`md ${className ?? ''}`}><ReactMarkdown rehypePlugins={katexEnabled ? mathPlugins : basePlugins} remarkPlugins={remarkPlugins} components={components} urlTransform={urlTransform}>{text}</ReactMarkdown></div>;
}
export default memo(MarkdownView);
