import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useSettingsStore } from '@state/settings';
import 'katex/dist/katex.min.css';
import { useEffect, useState, useRef } from 'react';
import { getClient } from '@lib/telegram/client';
import { Api } from 'telegram';
import { getInputPeerForForumId } from '@lib/telegram/peers';

// Global cache: messageId -> object URL
const idToUrlGlobal = new Map<number, string>();

interface MarkdownViewProps {
	text: string;
	className?: string;
	forumId?: number;
	debugId?: string | number;
}

export default function MarkdownView({ text, className, forumId, debugId }: MarkdownViewProps) {
	const { markdownEnabled, katexEnabled, imageMaxWidthPx } = useSettingsStore();
	const [resolved, setResolved] = useState<{ url: string; mime?: string; messageId: number }[]>([]);
	const [ids, setIds] = useState<number[]>([]);
	const [processedText, setProcessedText] = useState<string>(text);
	const idCursorRef = useRef(0);
	const urlOrderRef = useRef<string[]>([]);
	const urlCursorRef = useRef(0);
	useEffect(() => { idCursorRef.current = 0; urlCursorRef.current = 0; }, [text]);
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const mediaIds: number[] = [];
				const rx = /tg-media:(\d+)/g;
				let match;
				while ((match = rx.exec(text)) !== null) {
					mediaIds.push(Number(match[1]));
				}
				setIds(mediaIds);

				if (mediaIds.length === 0) {
					setResolved([]);
					setProcessedText(text);
					return;
				}

				const client = await getClient();
				const out: { url: string; mime?: string; messageId: number }[] = [];

				let list: any[] = [];
				try {
					if (Number.isFinite(forumId)) {
						const channel = getInputPeerForForumId(forumId!);
						const msgs: any = await (client as any).invoke(new Api.channels.GetMessages({
							channel,
							id: mediaIds.map((n) => new Api.InputMessageID({ id: n }) as any),
						} as any));
						list = (msgs?.messages ?? []).filter((mm: any) => mm && (mm.className === 'Message' || mm._ === 'message'));
					} else {
						const msgs: any = await (client as any).invoke(new Api.messages.GetMessages({
							id: mediaIds.map((n) => new Api.InputMessageID({ id: n }) as any),
						} as any));
						list = (msgs?.messages ?? []).filter((mm: any) => mm && (mm.className === 'Message' || mm._ === 'message'));
					}
				} catch {
					list = [];
				}

				const idToMsg: Record<number, any> = {};
				for (const mm of list) idToMsg[Number(mm.id)] = mm;

				for (const mid of mediaIds) {
					const cached = idToUrlGlobal.get(mid);
					if (cached) {
						out.push({ url: cached, messageId: mid });
						continue;
					}
					const mm = idToMsg[mid];
					if (!mm?.media) { continue; }
					let mime: string | undefined;
					try {
						if ((mm.media.className === 'MessageMediaPhoto') || (mm.media._ === 'messageMediaPhoto')) {
							mime = 'image/jpeg';
						} else if ((mm.media.className === 'MessageMediaDocument') || (mm.media._ === 'messageMediaDocument')) {
							const doc = mm.media.document || {};
							mime = doc.mimeType || doc.mime_type;
						}
						const data: any = await (client as any).downloadMedia(mm.media);
						const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
						try {
							const root: any = (navigator as any).storage && (navigator as any).storage.getDirectory ? await (navigator as any).storage.getDirectory() : null;
							if (root) {
								const mediaDir = await root.getDirectoryHandle('fg-media', { create: true });
								const ext = ((): string => {
									if (!mime) return 'bin';
									if (mime.startsWith('image/')) {
										if (mime.includes('jpeg')) return 'jpg';
										if (mime.includes('png')) return 'png';
										if (mime.includes('gif')) return 'gif';
										if (mime.includes('webp')) return 'webp';
									}
									if (mime.startsWith('video/')) {
										if (mime.includes('mp4')) return 'mp4';
										if (mime.includes('webm')) return 'webm';
									}
									return 'bin';
								})();
								const fileName = `${mid}.${ext}`;
								let fileHandle: any;
								let file: File | undefined;
								try {
									fileHandle = await mediaDir.getFileHandle(fileName);
									file = await fileHandle.getFile();
									if (file && file.size > 0) {
										const url = URL.createObjectURL(file);
										idToUrlGlobal.set(mid, url);
										out.push({ url, mime, messageId: mid });
										continue;
									}
								} catch {}
								fileHandle = await mediaDir.getFileHandle(fileName, { create: true });
								const writable = await fileHandle.createWritable();
								await writable.write(blob);
								await writable.close();
								file = await fileHandle.getFile();
								const url = file ? URL.createObjectURL(file) : '';
								idToUrlGlobal.set(mid, url);
								out.push({ url, mime, messageId: mid });
							} else {
								const url = URL.createObjectURL(blob);
								idToUrlGlobal.set(mid, url);
								out.push({ url, mime, messageId: mid });
							}
						} catch {
							const url = URL.createObjectURL(blob);
							idToUrlGlobal.set(mid, url);
							out.push({ url, mime, messageId: mid });
						}
					} catch {}
				}

				if (!cancelled) {
					setResolved(out);
					try {
						const idToUrl = new Map<number, string>();
						for (const item of out) idToUrl.set(item.messageId, item.url);
						const replaced = text.replace(/(\!\[[^\]]*\]\()(tg-media:)(\d+)(\))/g, (full, a, proto, id, c) => {
							const url = idToUrl.get(Number(id));
							return url ? `${a}${url} \"${url}\"${c}` : full;
						});
						setProcessedText(replaced);
						urlOrderRef.current = mediaIds.map((id) => idToUrl.get(id) || '').filter(Boolean) as string[];
						urlCursorRef.current = 0;
					} catch {
						setProcessedText(text);
						urlOrderRef.current = [];
						urlCursorRef.current = 0;
					}
				}
			} catch {
				setResolved([]);
				setProcessedText(text);
				urlOrderRef.current = [];
				urlCursorRef.current = 0;
			}
		})();
		return () => { cancelled = true; };
	}, [text]);

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

	const sanitizeOptions: any = {
		...defaultSchema,
		protocols: {
			...((defaultSchema as any).protocols || {}),
			src: [ ...((((defaultSchema as any).protocols || {}).src) || []), 'tg-media', 'blob' ],
		},
		attributes: {
			...defaultSchema.attributes,
			div: [
				...((defaultSchema as any).attributes?.div || []),
				['className', 'math', 'math-display']
			],
			span: [
				...((defaultSchema as any).attributes?.span || []),
				['className', 'math', 'math-inline'],
				['className', /^hljs.*$/]
			]
			,
			code: [
				...((defaultSchema as any).attributes?.code || []),
				['className', 'hljs', /^language[-_a-z0-9]+$/, 'inline-code']
			],
			pre: [
				...((defaultSchema as any).attributes?.pre || []),
				['className', 'hljs', /^language[-_a-z0-9]+$/]
			],
			img: [
				...((defaultSchema as any).attributes?.img || []),
				['className'],
				['style'],
				['src'],
				['title']
			]
		}
	};

	const rehypePlugins: any[] = [[rehypeSanitize, sanitizeOptions], rehypeHighlight];
	if (katexEnabled) rehypePlugins.push(rehypeKatex as any);
	urlCursorRef.current = 0;
	idCursorRef.current = 0;
	return (
		<div className={`md ${className ?? ''}`}>
			<ReactMarkdown
				key={processedText}
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
					const srcProp: string | undefined = (props as any)?.src;
					const titleProp: string | undefined = (props as any)?.title;
					if (srcProp && srcProp.length > 0 && !/^tg-media:/.test(srcProp) && !srcProp.startsWith('blob:')) {
						return <img {...props} style={style} />;
					}
					let effectiveSrc: string | undefined = undefined;
					if (srcProp && String(srcProp).startsWith('blob:')) {
						effectiveSrc = srcProp;
					} else if (titleProp && String(titleProp).startsWith('blob:')) {
						effectiveSrc = titleProp;
					}
					if ((!effectiveSrc || effectiveSrc.length === 0) && urlCursorRef.current < urlOrderRef.current.length) {
						effectiveSrc = urlOrderRef.current[urlCursorRef.current++];
					}
					if (!effectiveSrc || effectiveSrc.length === 0) {
						const m = /^tg-media:(\d+)$/.exec(String(srcProp || ''));
						let idToUse: number | undefined = m ? Number(m[1]) : undefined;
						if ((!idToUse || !Number.isFinite(idToUse)) && (!srcProp || srcProp.length === 0) && idCursorRef.current < ids.length) {
							idToUse = ids[idCursorRef.current++];
						}
						const found = (idToUse && Array.isArray(resolved) && resolved.length) ? resolved.find(r => r.messageId === idToUse) : undefined;
						if (found) effectiveSrc = found.url;
					}
					const altProp = (props as any)?.alt;
					const classNameProp = (props as any)?.className;
					return <img alt={altProp} className={classNameProp} src={effectiveSrc || undefined} style={style} />;
				}
			}}
			>
				{processedText}
			</ReactMarkdown>
		</div>
	);
}