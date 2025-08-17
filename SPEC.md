# ForumGram — v1 Full Build Spec (React + Vite PWA, GramJS, TypeScript)

**Target**: A fully client‑side forums‑only Telegram client as a **Vite + React + TypeScript PWA**, deployed to **Vercel** at **forum-gram.vercel.app**. No custom backend. All data lives in Telegram (a **supergroup with Forum Topics enabled**). Local cache/index lives in IndexedDB.

---

## 0) Product Goals & Constraints

* **Goals**

  * Forums UX (phpBB/Discord‑Forums style) on top of Telegram Forums (Topics in Supergroups).
  * Fast read/write, smooth navigation on huge forums.
  * Client‑side moderation, anti‑spam, and optional forum‑wide backups.
  * Markdown + KaTeX rendering, media upload/view.
  * Client‑side **sub‑threads** within a Topic using signed tags for fast server‑side search.
  * Discovery of forums by `@handle`/invite and directory channels; local “catalogue”.
* **Non‑Goals (v1)**

  * No server‑side enforcement bot (optional post‑MVP).
  * No general keyword search across all Telegram (API doesn’t expose it).
  * No custom Telegram login via QR (v1 uses phone code flow).
* **Hard Constraints**

  * **Pure client**: MTProto via **GramJS** in browser.
  * Security: api\_id/api\_hash are hard-coded (`api_id = 20227969`, `api_hash = 3fc5e726fcc1160a81704958b2243109`); mitigate with rate limits/rotation if abused.

---

## 1) Architecture Overview

**Frontend**: React (Vite, TS) + PWA

* **State**: Zustand (global UI/app state) + React Query (async fetch & caching).
* **Storage**: IndexedDB via Dexie (messages, media blobs/thumbnails, boards, catalogue, sessions, minimal inverted index).
* **Workers**:

  * Web Worker for text indexing & search (FlexSearch) per Topic/Board.
  * Service Worker (Workbox) for offline shell & media cache.
* **Telegram**: GramJS (MTProto) browser client; session persisted in IndexedDB.
* **Rendering**: `react-markdown` + `remark-gfm` + `rehype-katex` (KaTeX) + `rehype-highlight` + `rehype-sanitize`.
* **Virtualization**: `react-virtuoso` for topic/board & message lists.

**Forum Model**

* One **supergroup** with **forum=true** (Topics enabled).
* **Topic = Board**.
* **Sub‑threads** inside a Board/Topic via a signed tag appended to each message (see §6).
* Manifests & ACL stored as signed fenced blocks in description/pinned message (see §7).

---

## 2) Repository & Project Setup

**Repo name**: `forumgram`

**Package scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "lint": "eslint ."
  }
}
```

**Key Dependencies**

```
telegram (GramJS)
react, react-dom, react-router-dom
zustand, @tanstack/react-query
Dexie, flexsearch, idb-keyval (optional)
react-markdown, remark-gfm, rehype-katex, katex, rehype-highlight, rehype-sanitize
react-virtuoso
jszip, file-saver (backup/export)

# PWA & tooling
workbox-window, vite-plugin-pwa, vite-plugin-node-polyfills (optional)
zod (schema validation), date-fns, lodash-es
```

**Vite config notes**

* Provide browser polyfills if GramJS requires Node shims (Buffer, process). Consider `vite-plugin-node-polyfills`.
* Register PWA plugin with manifest (name, icons, start\_url `/`, display `standalone`).

**Directory Structure**

```
/ (repo)
  /src
    /app       # app bootstrap, routes
    /components
    /features
      /auth
      /forum    # topics/boards, sub-threads, composer
      /catalog  # discovery & catalogue
      /moderation
      /backup
      /settings
    /lib        # gramjs client, api wrappers, crypto, sanitize
    /state      # zustand stores
    /workers    # search worker
    /styles
  /public      # icons, manifest
  vite.config.ts
  workbox-sw.ts
  vercel.json
```

---

## 3) MTProto / GramJS Integration

**Client bootstrap**

```ts
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';

export async function makeClient(sessionStr: string | null) {
  const apiId = ...;
  const apiHash = ...;
  const session = new StringSession(sessionStr ?? '');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}
```

**Auth (phone code + 2FA)**

```ts
export async function signIn(client: TelegramClient, phone: string, code: string, password?: string) {
  try {
    return await client.invoke(new Api.auth.SignIn({
      phoneNumber: phone,
      phoneCode: code,
      phoneCodeHash: /* from SendCode step, stored in state */ '',
    }));
  } catch (e: any) {
    if (e.errorMessage === 'SESSION_PASSWORD_NEEDED' && password) {
      const pwd = await client.invoke(new Api.account.GetPassword());
      // Use client.checkPassword (GramJS helper) or SRP calculation
      // ... omitted for brevity
    }
    throw e;
  }
}
```

**Forum detection & info**

* Use `channels.getFullChannel` to read `forum=true`, `participants_count`, `about`, `pinnedMsgId`, etc.
* Topics: `channels.getForumTopics` / `channels.getForumTopicsByID`.

**Topic‑scoped operations**

* Search within a Topic: `messages.search` with `top_msg_id` (topic id) and a query string (e.g., `#t:9k7w`).
* Send within a Topic: `messages.sendMessage` with `replyTo` set to `replyToTopId=topicId` (GramJS ReplyTo object) to post in that topic’s thread.
* History paging: `messages.getHistory(peer, { addOffset, offsetId, limit })` (include `top_msg_id` for topic scope where applicable).

**Moderation**

* Delete: `messages.deleteMessages`.
* Restrict/ban: `channels.editBanned` with appropriate rights.
* Slowmode/locks: `channels.toggleSlowMode`, or `channels.editForumTopic` to close a topic.

**Discovery**

* Resolve public forum handle: `contacts.resolveUsername` → peer → `channels.getFullChannel`.
* Preview invite links: `messages.checkChatInvite`.

**Media Upload**

* Use GramJS `uploadFile` helper, then `messages.sendMedia` with `inputMediaUploadedPhoto`/`inputMediaUploadedDocument`.

---

## 4) Navigation & Screens

* **/login** — phone + code flow, session persistence, logout.
* **/discover** — search handle/invite; parse directory channels; preview & add to catalogue.
* **/forum/\:id** — forum overview: Boards (Topics) list (title, unread, last activity, pinned).
* **/forum/\:id/topic/\:topicId** — Board view:

  * **Left**: Sub‑threads list (from tags, sorted by last activity).
  * **Right**: Messages (virtualized), composer, inline media.
* **/backup** — owner/admin only: backup controls, progress, export ZIP.
* **/settings** — appearance, KaTeX/markdown toggles, moderation rules, passcode for secret.

**UI Components**

* `TopicList`, `SubThreadList`, `MessageList`, `MessageItem`, `Composer`, `PreviewCard`, `MediaViewer`, `BackupPanel`, `ModerationBar`, `AclBadge`.

---

## 5) Local Data Models (TypeScript)

```ts
export interface Session { dcId: number; authKey: string; userId: number; }

export interface Forum { id: number; accessHash?: string; username?: string; title: string; isForum: boolean; isPublic: boolean; about?: string; members?: number; tags?: string[]; lang?: string; lastActivity?: number; source: 'username'|'invite'|'directory'; addedAt: number; }

export interface Topic { id: number; forumId: number; title: string; iconEmoji?: string; lastMsgId?: number; unreadCount?: number; pinned?: boolean; }

export interface SubThread { id: string; topicId: number; title: string; createdBy: number; createdAt: number; lastMsgId?: number; lastActivity?: number; tag: string; }

export interface Message { id: number; topicId: number; fromId: number; date: number; textMD: string; media?: MediaMeta; replyToId?: number; threadTag?: string; threadId?: string; edited?: boolean; }

export interface MediaMeta { kind: 'photo'|'video'|'audio'|'file'; size?: number; mime?: string; thumbBlobId?: string; fileBlobId?: string; }

export interface CatalogueSource { id: number; title: string; channelId: number; lastScannedMsgId?: number; }

export interface AclRule { topicId?: number; threadTag?: string; allow?: string[]; deny?: string[]; }

export interface ForumAcl { roles: Record<string, 'owner'|'admin'|'moderator'|'member'|'readonly'|'banned'>; rules: AclRule[]; sig?: string; }
```

---

## 6) Sub‑Threads, Tagging & Content Safety

**Problem**: Need intra‑Topic sub‑threads discoverable by Telegram’s server search, without metadata collisions.

**Solution**: Append a **signed tag as the last line** of each message in a sub‑thread; put a signed JSON **thread manifest** only in the first post.

**Canonical Tag Line**

```
#t:<BASE32ID>|s:<BASE64URL_SIG>
```

* Regex: `^#t:([A-Z2-7]{4,12})\|s:([A-Za-z0-9_-]{16,})$`
* `BASE32ID` is 4–12 chars, collision‑checked per Topic.
* Signature: `HMAC_SHA256(forumSecret, threadId + '|' + authorId + '|' + nonce)` → base64url.
* The tag line is **not rendered**; it’s parsed, verified (if secret available), and stored in message meta.

**Thread Manifest (first post only)**

````
```tgthread v1
{"id":"9k7w","title":"Kalman filter intuition","tags":["controls"],"owner":123456789,"created":1690000000,
 "sig":"<base64url>","salt":"<publicSalt>"}
````

````
- The fenced block is hidden in UI; we show a badge instead.
- Sign manifest with `forumSecret` over canonical JSON.

**Parser/Composer (pseudocode)**
```ts
function composeMessage(userText: string, threadId: string, secret: CryptoKey, authorId: number) {
  const safe = sanitizeMD(userText);
  const nonce = randomNonce();
  const sig = hmacBase64Url(secret, `${threadId}|${authorId}|${nonce}`);
  return `${safe}\n\n#t:${threadId}|s:${sig}`;
}

function parseMessage(raw: string, secret?: CryptoKey) {
  const lines = normalize(raw).split('\n');
  const last = lines.at(-1)!;
  const m = /^#t:([A-Z2-7]{4,12})\|s:([A-Za-z0-9_-]{16,})$/.exec(last);
  let threadTag: string|undefined;
  if (m) { /* verify if secret present; pop line; else ignore as text */ }
  const visible = lines.join('\n');
  const manifests = extractFencedBlocks(visible, ['tgthread v1', 'tgforum-acl v1']);
  return { visible, threadTag, manifests };
}
````

**Sanitization Rules**

* `rehype-sanitize` custom schema; disable `rehype-raw`; strip `javascript:` URLs and event handlers; KaTeX `{trust:false}`.
* Never treat arbitrary user lines as metadata unless **exact position + verified signature** (or matching manifest present for read‑only clients).

---

## 7) Permissions (phpBB‑style)

**Roles**: owner, admin, moderator, member, readonly, banned.

**ACL Storage**: Signed fenced JSON in description or pinned message in **General** topic:

````
```tgforum-acl v1
{"roles":{"123":"moderator","456":"readonly"},
 "rules":[{"topicId":10,"allow":["admin","moderator"],"deny":["member"]}],
 "sig":"<base64url>"}
````

````
**Enforcement**
- **Telegram‑level**: ban/kick/restrict, delete, slowmode, close topics.
- **Client‑level**: hide composer per Topic/sub‑thread; auto‑delete violating posts if an admin is online.
- **Optional later**: helper bot for 24/7 enforcement.

**Secrets**
- `forumSecret` stored locally for owners/admins; **optional passcode** to encrypt with WebCrypto (PBKDF2→AES‑GCM).

---

## 8) Moderation & Anti‑Spam
**Heuristics**: URL flood (>N links/Δt), duplicate text, banned regex, mass mentions, first‑seen age < X minutes.

**Actions**: shadow‑hide locally → if admin, `deleteMessages`; optional `channels.editBanned` for offenders; toggle slowmode or close Topic.

**UX**: moderation bar with one‑tap actions; audit log (local only) per session.

---

## 9) Discovery & Catalogue (Client‑Only)
**Detect forums**: `forum=true` on channel (via `channels.getFullChannel`).

**Resolve**: `contacts.resolveUsername` for public `@handle`; `messages.checkChatInvite` for invite links.

**Directory Channels**: App can follow one or more public channels that post forum links + optional **tgforum‑manifest** JSON fence. The app parses and populates a browsable list.

**Catalogue Storage (IndexedDB)**: `Forum` entries + `CatalogueSource` (directory channels).

**UI**: Discover panel with *Handle/Link*, *Directories*, *Recent* tabs; preview card (title, avatar, members, last activity, tags); **Join**, **Add to Catalogue**, **Open Read‑Only** (if public history).

---

## 10) Backup & Export (Owner/Admin)
**Scope**: All topics, messages, media, manifests.

**Process**
1. List Topics via `channels.getForumTopics`.
2. For each Topic, page history newest→oldest; store messages + media metadata.
3. Download media on demand or batch (throttled); store as blobs in IndexedDB.
4. Export via JSZip:
   - `/forum.json` (forum & topics metadata)
   - `/topics/<topicId>/thread-<threadId>.json`
   - `/media/<blobId>`
   - `/raw/<messageId>.txt` (optional)
5. Resume with `/backup_state.json` checkpoints.

**UI**: scope select, include media toggle, concurrency slider, progress bars, **Export ZIP** button.

**Rate limits**: exponential back‑off; queue concurrency ≤ 2–3.

---

## 11) Search & Indexing
- **Server search**: `messages.search` with `top_msg_id` for Topic scope and query `#t:<id>` for sub‑thread recall.
- **Local index**: Build per‑Topic FlexSearch index for message text, authors, and tags; evict LRU topics; cap index size.
- **Jump to last unread**: track per‑Topic `lastSeenMsgId` locally.

---

## 12) PWA & Performance
- **Virtualized lists** everywhere (`react-virtuoso`).
- **Prefetch** ±1 page when scrolling.
- **Thumbnails first**; on‑demand full media download; stream via object URLs.
- **Service Worker**: cache app shell; cache recent media; background sync for pending sends (if browser permits).
- **Installable** on desktop/mobile; dark/light themes.

---

## 13) Accessibility & i18n
- Keyboard shortcuts: `j/k` navigate, `r` reply, `n` new sub‑thread.
- ARIA roles for lists, announcements on new messages.
- RTL support; easy string externalization; date/number locale via `Intl`.

---

## 14) Error Handling & Edge Cases
- Network drops → queue sends, retry with back‑off; show offline banner.
- Auth errors: expired code, 2FA required, flood wait; surface actionable guidance.
- Permissions errors: disable composer with reason; reflect Telegram rights.
- Spoofed metadata: treat as plain text unless verified.

---

## 15) Build, Deploy, and Ops
**Vercel**
- Create project → link to GitHub repo `forumgram`.
- Domain: `forum-gram.vercel.app`.
- Build command: `vite build`; output: `dist/`.

**vercel.json** (minimal)
```json
{
  "builds": [{ "src": "package.json", "use": "@vercel/static-build" }],
  "routes": [{ "src": "/(.*)", "dest": "/index.html" }]
}
````

**PWA Manifest** (`public/manifest.webmanifest`)

```json
{
  "name": "ForumGram",
  "short_name": "ForumGram",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#111",
  "theme_color": "#111",
  "icons": [{"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"}]
}
```

**Security Notes**

* Exposed api\_id/api\_hash is normal for Telegram clients. Provide **rate‑limit** and **log out** options; document risk to users.
* Optional **app passcode** to encrypt `forumSecret` and sensitive cache using WebCrypto.

---

## 16) Testing Plan

**Unit (Vitest)**

* Tag compose/parse; manifest/ACL sign/verify; sanitizer ensures no script execution.

**Integration**

* Login flow to valid session; topic list load; send/edit/delete in Topic; search `#t:<id>`; media upload.

**E2E (Playwright)**

* Happy path through Discover → Preview → Add to Catalogue → Open Board → Create Sub‑Thread → Post with media → Backup export.

**Perf Budgets**

* Time to interactive ≤ 2.5s on mid‑range mobile.
* Message list scroll jank < 5ms frame budget.

---

## 17) Acceptance Criteria (Definition of Done)

* User can log in, pick a forum, see Topics (Boards), open a Topic (Board), see sub‑threads list and messages.
* Create a new sub‑thread; replies auto‑tag; `messages.search` returns complete thread by tag.
* Compose supports Markdown + KaTeX preview; messages render sanitized; images/videos open inline.
* Moderators can delete messages and restrict users from within the app.
* Discover by `@handle` or invite link; add to catalogue; open read‑only if applicable.
* Backup/export produces a ZIP with JSON + (optional) media; can resume.
* PWA installable; works offline for cached views.

---

## 18) Implementation Checklist (Chronological)

1. **Scaffold** Vite React‑TS; PWA manifest; SW; theming; router.
2. **GramJS** client, session storage, login UI.
3. **Forum load**: `getFullChannel` + topics list; virtualized lists.
4. **Topic view**: history paging; message list; composer; media viewer.
5. **Sub‑threads**: tagging rules; parser; sub‑thread list; topic‑scoped search.
6. **Markdown/KaTeX** render with sanitization; code highlight.
7. **Moderation**: delete, restrict, basic heuristics & shadow‑hide.
8. **Discovery**: handle/invite resolver; preview; catalogue store & UI.
9. **Backup/export**: history walker; media fetch; ZIP export; resume.
10. **Settings**: passcode encryption for secret; moderation rules; theme.
11. **Polish & tests**: vitest + playwright; perf tuning; a11y.
12. **Deploy** to Vercel; smoke tests; README.

---

## 19) Appendix — Code Snippets

**ReplyTo top message (post in Topic)**

```ts
import { Api } from 'telegram';
await client.invoke(new Api.messages.SendMessage({
  peer: forumPeer, // channel
  message: composeMessage(text, threadId, secret, myId),
  replyTo: new Api.InputReplyToMessage({ replyToTopId: topicId })
}));
```

**Topic‑scoped search for sub‑thread**

```ts
await client.invoke(new Api.messages.Search({
  peer: forumPeer,
  q: `#t:${threadId}`,
  topMsgId: topicId,
  limit: 100
}));
```

**Delete message**

```ts
await client.invoke(new Api.messages.DeleteMessages({ id: [msgId], revoke: true }));
```

**Restrict user**

```ts
await client.invoke(new Api.channels.EditBanned({
  channel: forumPeer,
  participant: user,
  bannedRights: new Api.ChatBannedRights({
    untilDate: 0,
    sendMessages: true,
  })
}));
```

**Upload media & send**

```ts
const file = await client.uploadFile({ file: myFile, workers: 1 });
await client.invoke(new Api.messages.SendMedia({
  peer: forumPeer,
  media: new Api.InputMediaUploadedDocument({ file, mimeType: myFile.type, attributes: [] }),
  message: composeMessage(caption, threadId, secret, myId),
  replyTo: new Api.InputReplyToMessage({ replyToTopId: topicId })
}));
```

**Sanitized Markdown render (React)**

```tsx
<ReactMarkdown
  remarkPlugins={[gfm]}
  rehypePlugins={[[rehypeKatex], [rehypeHighlight], [rehypeSanitize, schema]]}
>
  {visibleText}
</ReactMarkdown>
```

---

## 20) Future (Post‑MVP)

* Global cross‑topic search; move/split threads; sticky rules; topic tagging.
* Helper bot for always‑on ACL enforcement and scheduled backups.
* Switchable engine to TDLib (tdweb) for larger caches and richer features.
* Multi‑forum dashboard with unified notifications.
