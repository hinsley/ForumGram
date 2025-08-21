# ForumGram Threads Design Options (Boards → Threads)

ForumGram maps Telegram supergroups with Topics enabled to a forums model where a Topic is a Board. Telegram Topics cannot have subtopics, so this document explores multiple designs to get Threads inside a Board. Each plan specifies mechanics, protocols, retrievability, pros/cons, required permissions, and migration notes. Mix‑and‑match and hybrids are encouraged.

## Design Axes

- **Discoverability**: Can a thread be recalled using Telegram server search alone?
- **Integrity**: Can clients verify that a message belongs to a thread without trusting content blindly?
- **Backward compatibility**: Looks reasonable in stock Telegram clients.
- **Permissions**: Requires admin rights to create topics, pin messages, or run a bot?
- **Cost/Scale**: Topic count growth, search performance, rate limits.
- **UX**: Easy to post/reply, clear linking, robust when users post from native Telegram apps.

---

## Plan A — Signed Hashtag Tagging (Baseline, server‑searchable)

- **Summary**: Keep threads as signed `#t:<ID>` tags appended as the last line of each message. A first post carries a signed fenced manifest.
- **Protocol**:
  - Last line exact match (not rendered): `#t:<BASE32ID>|s:<BASE64URL_SIG>`.
  - First post includes a hidden fenced block:
    ```
    ```tgthread v1
    {"id":"9k7w","title":"Kalman filter intuition","tags":["controls"],"owner":123,"created":1690000000,"sig":"<b64url>","salt":"<public>"}
    ```
    ```
  - Signature: HMAC_SHA256 over canonical fields with `forumSecret` (owners/mods).
- **Retrieval**:
  - Topic‑scoped server search: `messages.search(q="#t:<ID>", top_msg_id=<topicId>)`.
  - Local parse verifies signature if secret present; otherwise treats as plain text unless a valid manifest is found for the starter.
- **Pros**: Server‑searchable, no admin rights, works from native apps if users copy the tag, robust to partial history.
- **Cons**: Users can forget the tag when posting from Telegram; tag can be spoofed without secret (client must ignore unverifiable lines); leaks thread IDs in plaintext.
- **Permissions**: None beyond normal posting.
- **Migration**: Already referenced in SPEC (§6). Keep as the default.

---

## Plan B — Reply‑Anchored Threads (Chain to Starter)

- **Summary**: A thread is anchored to its starter message. All thread posts are replies (directly or via any reply chain) to that starter.
- **Protocol**:
  - Starter: optional `tgthread v1/v2` manifest in body (hidden by UI) and a visible thread title.
  - Posting: clients reply to the starter when composing; optionally add `#t:<ID>` for cross‑client recall.
- **Retrieval**:
  - Page the Topic and collect all messages where `reply_to_msg_id` equals the starter id or where the reply chain reaches the starter (requires local reconstruction).
  - To accelerate, also tag starters with `#t:<ID>` and index locally; search by `#t:<ID>` and then filter by reply ancestry to avoid false positives.
- **Pros**: Intuitive; works even if users forget tags (as long as they reply); visible structure in stock Telegram; signature optional.
- **Cons**: No first‑class server API to fetch “all replies to X” in supergroups; requires local scanning/indexing; replies can drift if users reply to unrelated posts.
- **Permissions**: None.
- **Migration**: Can be layered on Plan A by treating `#t:<ID>` starters as anchors.

---

## Plan C — Per‑Thread Topic (One Topic per Thread)

- **Summary**: Treat a Board as a directory/landing topic; each Thread is a separate Telegram Topic. The Board maintains an index linking to its Thread topics.
- **Protocol**:
  - Creating a thread creates a new Topic titled `BoardSlug • <Thread Title>` with an icon.
  - The Board’s main topic has a pinned “Index” message (or description) that lists threads with deep links to their topics. Keep a signed index manifest.
  - Optional: add a `tgboard-index v1` fenced JSON that maps threadId → topicId.
- **Retrieval**:
  - Native: open the thread’s Topic; full history and search work natively; no tags required.
- **Pros**: Best native UX; no tagging errors; server features (pinning, topic moderation) per thread.
- **Cons**: Requires admin rights to create topics; topic explosion for busy boards; topic list becomes noisy; some forums may limit topic counts.
- **Permissions**: Admin/mod rights to manage topics/pins.
- **Migration**: Provide tooling to “promote” Plan A/B threads into their own topics and backfill links in the Board index.

---

## Plan D — Shadow Index Topic per Board

- **Summary**: Each Board has a hidden/low‑visibility “Shadow Index” Topic. Every thread has a single canonical index message posted in the Shadow Index that contains title, author, tags, and a link to the starter in the main Board topic.
- **Protocol**:
  - Index message format:
    ```
    ```tgthread-index v1
    {"id":"9k7w","boardTopicId":123,"starterMsgId":456,"title":"…","tags":["…"],"created":1690,"sig":"…"}
    ```
    ```
  - Thread posts in the main Board use Plan A or B; index message is updated by the creator or moderators.
- **Retrieval**:
  - To list threads: search or page the Shadow Index topic only (cheap); open a thread by following its starter link.
- **Pros**: Fast thread listing; reduces scanning; keeps the Board’s main topic cleaner; index can store extra metadata.
- **Cons**: Requires at least one additional topic per board; still relies on tags or reply anchors for membership; users might not see shadow topic in native apps.
- **Permissions**: Topic creation rights recommended; pin the index in Shadow.
- **Migration**: Can be auto‑generated from Plan A data.

---

## Plan E — Dual‑Tagging with Board & Thread

- **Summary**: Add two signed tags to each post: `#b:<BOARD>|s:…` and `#t:<THREAD>|s:…`. Useful when Boards and Threads need disambiguation across merges or when running in groups without Topics.
- **Protocol**:
  - Last lines:
    - `#b:<BASE32BOARD>|s:<SIG>`
    - `#t:<BASE32THREAD>|s:<SIG>`
  - Starter carries a manifest linking both IDs and the actual Telegram `topicId`.
- **Retrieval**:
  - Server search by thread tag within the topic; cross‑check board tag to avoid drift; allows re‑parenting threads across boards with a signed update.
- **Pros**: Stronger integrity; supports future board reorganizations.
- **Cons**: More visual noise if users post from native clients; larger footers.
- **Permissions**: None.
- **Migration**: Extend Plan A manifests to include `boardId`.

---

## Plan F — Index Bot (Optional Helper, No Backend for App)

- **Summary**: A dedicated bot account (owned by forum admins) posts and maintains thread index entries and reminders to include tags, but the ForumGram app remains client‑only.
- **Protocol**:
  - On thread creation, the bot posts an index card (rich text) in the Board or Shadow Index with deep links and `#t:<ID>` for searchability.
  - The bot can periodically reconcile missing tags by replying with a prompt containing the thread tag.
- **Retrieval**:
  - Search by `#t:<ID>` or navigate via bot‑posted index.
- **Pros**: Better reliability, reduces human error, keeps index fresh; can operate even when no ForumGram client is online.
- **Cons**: Requires bot setup, admin permissions, and hosting; adds dependency.
- **Permissions**: Invite bot with rights to post/pin in Boards/Shadow.
- **Migration**: Bot can retro‑index existing Plan A threads.

---

## Plan G — Reply‑Only Threads with Local Auto‑Tagging (Stealth)

- **Summary**: Users reply to the starter in any client; ForumGram auto‑edits their posts (when possible) to append a hidden tag line shortly after sending.
- **Protocol**:
  - Detect outgoing message via client; if it replies to a known starter, edit message to add `#t:<ID>|s:<SIG>` on the last line.
  - If edit rights are absent or time window expired, fall back to local indexing only.
- **Retrieval**:
  - Prefer server search on the tag; otherwise reconstruct via reply chains.
- **Pros**: Minimal friction for users; better coverage over time.
- **Cons**: Requires edit rights and quick action; edits are visible in Telegram; race conditions possible.
- **Permissions**: Edit own messages; no special admin rights.
- **Migration**: Augments Plan B.

---

## Plan H — Per‑Thread Message Bundles (Album ID as Soft Group)

- **Summary**: Use media album grouping (`grouped_id`) opportunistically to bundle the starter and the first N replies, with tags for the rest.
- **Protocol**:
  - When starting a thread, send a small media stub (e.g., 1px image) and the starter in an album so they share `grouped_id`. Early replies from ForumGram can attach to that album.
- **Retrieval**:
  - Search by `grouped_id` plus `#t:<ID>`.
- **Pros**: Slightly better cohesiveness for early messages; unique server field.
- **Cons**: Hacky; album limits; text‑only messages cannot be attached in all clients; not reliable long‑term.
- **Permissions**: None.
- **Migration**: Not recommended as primary; keep as an experiment.

---

## Plan I — Signed Front‑Matter (YAML/JSON) with Invisible Rendering

- **Summary**: Put a compact signed front‑matter block at the top or bottom of messages; render it invisible.
- **Protocol**:
  - Example:
    ```
    ```tgmeta v1
    t: 9k7w
    b: math
    s: <sig>
    ```
    ```
  - Clients strip this on render; stock Telegram shows it as code (acceptable for power users).
- **Retrieval**:
  - Server search can still match `t: 9k7w` or the fenced header; local parse verifies signature.
- **Pros**: Flexible metadata beyond IDs; extensible.
- **Cons**: Visual noise in native clients; easier to break formatting; not ideal for casual users.
- **Permissions**: None.
- **Migration**: Alternate to Plan A tag line.

---

## Plan J — Per‑Board Ledger Messages (CRDT‑like)

- **Summary**: Maintain a sequence of small “ledger” messages in the Board or Shadow Topic that append events like THREAD_CREATED, POST_ATTACHED, THREAD_RENAMED with signatures.
- **Protocol**:
  - Each ledger entry is a fenced JSON with monotonic counter and signature: `"op":"THREAD_CREATED","id":"9k7w",…`.
  - ForumGram clients merge ledgers locally to reconstruct state.
- **Retrieval**:
  - Page only the ledger messages for thread list; thread membership still relies on tags or replies.
- **Pros**: Auditable history, supports renames/moves/splits.
- **Cons**: Complex; requires careful conflict handling; might be noisy.
- **Permissions**: None; better if only mods post ledger entries.
- **Migration**: Can be bootstrapped from existing Plan A messages.

---

## Plan K — Per‑Thread Shortlinks with Deep Links

- **Summary**: Each thread has a short slug and a canonical deep link to the starter message; the slug appears in tags and index cards.
- **Protocol**:
  - Starter manifest includes `slug` and `t.me/c/<chan>/<msg>`; tag uses `#t:<slug>`.
- **Retrieval**:
  - Server search by `#t:<slug>`; open via deep link.
- **Pros**: Human‑readable; easy to share; compatible with A/B/D/F.
- **Cons**: Slug collisions to manage; link rot if messages are deleted.
- **Permissions**: None.
- **Migration**: Add slugs to existing manifests.

---

## Plan L — Promote Threads to Topics when Hot (Hybrid C + A)

- **Summary**: Start threads as tagged posts (Plan A/B). When a thread exceeds a threshold (messages/unread/age), auto‑promote to its own Topic and post a redirect message in the original Board.
- **Protocol**:
  - Promotion record in a ledger or index; the original starter gets an edit: “Thread moved to Topic #XYZ.”
- **Retrieval**:
  - Old posts found via tag; new posts in the dedicated Topic; the app shows them seamlessly as one thread.
- **Pros**: Scales with activity; keeps topic counts bounded by demand.
- **Cons**: Requires admin rights during promotion; link churn; needs good UI to avoid confusion.
- **Permissions**: Topic creation; edit/pin rights for redirects.
- **Migration**: Natural upward path from Plan A.

---

## Plan M — Minimal Local‑Only Threads (No Server Footprint)

- **Summary**: Threads exist purely in the client via local clustering and heuristics (same author, temporal proximity, reply chains). No tags.
- **Protocol**:
  - Local model groups messages; optional per‑client sharing via exported backup manifests.
- **Retrieval**:
  - Local index only; no server search.
- **Pros**: Zero friction; private; works even without write permissions.
- **Cons**: Not portable; inconsistent across clients; not recommended as primary.
- **Permissions**: None.
- **Migration**: Use as a fallback when tags are missing.

---

## Plan N — Message Buttons as Index Entries

- **Summary**: Use inline keyboards on index messages to navigate threads via deep links; users tap buttons to open the starter.
- **Protocol**:
  - Index bot or moderator posts a message with buttons `[Open Thread]` linking to the starter URL.
- **Retrieval**:
  - Human‑navigable; not searchable by server beyond text.
- **Pros**: Excellent UX in native clients; compact indexes.
- **Cons**: Requires bot or manual button creation; not helpful for search.
- **Permissions**: Bot posting rights (if automated).
- **Migration**: Complement to D/F.

---

## Recommended Composable Strategy

- **Default**: Plan A (signed tag + manifest) + Plan B (reply‑anchor enforcement in UI) for robustness.
- **Scaling**: Add Plan D (Shadow Index Topic) for fast thread listing; optionally Plan F (Index Bot) to automate hygiene.
- **Growth**: Apply Plan L to promote hot threads to their own Topics (Plan C) with redirects.

---

## Protocol Details (v2 proposals)

- **Thread Manifest v2**
  - Fence: `tgthread v2`
  - Fields: `{ id, slug, title, boardId, topicId, starterMsgId, owner, created, tags, parentId?, movedToTopicId?, sig }`
  - Canonical JSON: keys sorted; UTF‑8; no whitespace variations.
  - Signature: HMAC_SHA256 with `forumSecret`; base64url.

- **Index Manifest v1**
  - Fence: `tgthread-index v1`
  - Fields: `{ id, topicId (shadow), boardTopicId, starterMsgId, title, tags, lastActivity, count, sig }`

- **Dual Tag Lines**
  - `#t:<BASE32>|s:<SIG>` — thread
  - `#b:<BASE32>|s:<SIG>` — board (optional)

---

## Failure Modes & Mitigations

- **Users forget tags**: Enforce reply‑to starter in UI (Plan B); auto‑edit to append tag (Plan G); index bot reminders (Plan F).
- **Spoofed tags**: Verify signatures; ignore unverifiable tags; rely on reply‑anchor as fallback.
- **Topic explosion**: Gate Plan C/L by thresholds and roles; archive or close inactive thread topics.
- **Search gaps**: Maintain Shadow Index (Plan D) and local indexes; keep a per‑board ledger (Plan J) for critical metadata.
- **Moderator turnover**: Store `forumSecret` encrypted with passcode per SPEC; allow secret rotation with re‑signing.

---

## Minimal API Usage Cheatsheet (GramJS)

- Topic‑scoped search by tag:
  - `messages.search({ peer, q: "#t:<ID>", topMsgId: <topicId>, limit })`
- Send in Topic:
  - `messages.sendMessage({ peer, message, replyTo: { replyToTopId: topicId } })`
- Create Topic (for C/L):
  - `channels.createForumTopic`
- Edit/pin Index messages:
  - `messages.editMessage`, `messages.updatePinnedMessage`, `channels.editForumTopic`

---

## Migration Paths

- From A → D/F: Generate Shadow Index from existing manifests; optionally let a bot maintain it.
- From A/B → C: Create Topic, move future posts there, post redirect in original Board; keep `movedToTopicId` in v2 manifest.
- From C → A: If topics must be collapsed, demote by writing `#t:<ID>` tags into starter and posting a summary index.

---

## Glossary

- **Board**: Telegram Topic inside a supergroup.
- **Thread**: Logical conversation inside a Board; implemented via tags, replies, or dedicated Topic.
- **Shadow Index Topic**: Auxiliary Topic holding per‑thread index messages.
- **Ledger**: Stream of signed metadata events used to reconstruct forum state.

