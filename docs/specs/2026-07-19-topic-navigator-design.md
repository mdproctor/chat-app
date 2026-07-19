# Topic Navigator and Topic View Mode — Design Spec

**Date:** 2026-07-19
**Issue:** casehubio/chat-app#6
**Status:** Draft
**Depends on:** casehubio/connectors#61 (Phase 1, CLOSED), casehubio/qhorus#328 (Topic field, CLOSED)
**Cross-repo:** casehubio/blocks-ui (channel-activity package — topic bar, feed view modes, input selector)
**Parent spec:** `connectors/specs/2026-07-07-qhorus-chat-ui-design.md` §2, §6 Phase 4

---

## Problem

Channels carry all conversation in a single flat stream. When multiple tasks, investigations, or discussion threads run in the same channel, the feed becomes unreadable — five agents working five tasks in one channel produces an interleaved stream where context-switching between topics requires manual scanning.

The conversation model spec (§1) defines topics as "named, persistent sub-conversations within a channel" — inspired by Zulip's mandatory topic model. The qhorus model already has `topic` on Message (qhorus#328, closed). The chat-app backend hardcodes every message's topic to `"General"`. The blocks-ui channel-feed has no topic awareness.

## Solution

Add topic support end-to-end: a `topics` entity in the backend with full lifecycle (active → resolved → archived, plus merge), a topic navigator bar and topic view mode in the channel-feed, and a topic selector in the message input. Topics use mandatory assignment with progressive disclosure — every message belongs to a topic (default "General"), but the UI only surfaces topic controls when a channel has more than one topic.

## Non-Goals

- Space-based channel hierarchy (issue #7 — separate concern)
- Topic-level permissions or access control
- Cross-channel topic linking
- Topic templates or auto-creation rules

---

## 1. Data Model

### Topic entity

Topics are first-class entities with IDs, not denormalized strings on messages. Topic is a mutable relationship (rename, merge) — normalizing it avoids O(n) message rewrites on rename and keeps the WebSocket protocol efficient.

```sql
CREATE TABLE topics (
    id          TEXT PRIMARY KEY,
    channel_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'ACTIVE',
    merged_into TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE(channel_id, name),
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (merged_into) REFERENCES topics(id)
);
```

Messages gain a `topic_id` column:

```sql
ALTER TABLE messages ADD COLUMN topic_id TEXT NOT NULL REFERENCES topics(id);
```

### Default topic

Channel creation auto-creates a "General" topic. Every channel always has at least one topic. The default topic cannot be archived or merged — it is the catch-all for messages without explicit topic assignment.

### Lifecycle state machine

```
ACTIVE  →  RESOLVED  →  ARCHIVED
  ↑           |
  +-----------+  (reopen)

Any non-default, non-MERGED topic  →  MERGED  (terminal, sets merged_into)
```

| State | Navigator bar | Accepts messages | Notes |
|-------|--------------|-----------------|-------|
| ACTIVE | Visible, normal | Yes | Default state |
| RESOLVED | Visible, dimmed, sorted to end | Yes (reopens to ACTIVE) | "Investigation complete" signal |
| ARCHIVED | Hidden (visible via toggle) | Yes (reopens to ACTIVE) | Fully hidden from default view |
| MERGED | Removed | No (source topic absorbed) | Terminal — messages already rewritten to target |

### Rename

Single row update: `UPDATE topics SET name = ?, updated_at = ? WHERE id = ?`. Zero message changes. One WebSocket `replace` op on the topics dataset.

### Merge

Merge topic A into topic B:

1. `UPDATE messages SET topic_id = B.id WHERE topic_id = A.id` — rewrites message assignments
2. `UPDATE topics SET state = 'MERGED', merged_into = B.id WHERE id = A.id`
3. Broadcast: `remove` op for A on topics dataset, `replace` op for B (updated message count), channel message snapshot

Constraints:
- Merge target must be non-MERGED (no recursive chains)
- Default topic ("General") cannot be the merge source
- Merge is not reversible

---

## 2. Backend API

### New REST endpoints

```
POST   /api/channels/{channelId}/topics
       Body: { name: string }
       Returns: { id, channelId, name, state, createdAt }
       Creates a new ACTIVE topic. 409 if name already exists in channel.

GET    /api/channels/{channelId}/topics
       Query: ?state=ACTIVE,RESOLVED (optional filter, comma-separated)
       Returns: [{ id, channelId, name, state, messageCount, latestActivityTs, createdAt }]

PUT    /api/channels/{channelId}/topics/{topicId}
       Body: { name?: string, state?: 'ACTIVE' | 'RESOLVED' | 'ARCHIVED' }
       Rename and/or state change. 409 if new name conflicts. 400 if invalid transition.

POST   /api/channels/{channelId}/topics/{topicId}/merge
       Body: { targetTopicId: string }
       Merges this topic into the target. 400 if target is MERGED or source is default.
```

### Modified endpoints

`PostMessageRequest` gains `topic` and `topicId` fields:

```java
record PostMessageRequest(String text, String messageType, String actorType,
                          String target, List<Map<String, Object>> artefactRefs,
                          String topic, String topicId)
```

**`POST /api/channels/{channelId}/messages`:**
- If `topicId` is provided and valid: use it directly (stable reference, avoids rename race).
- Else if `topic` name is provided: resolve name → topic_id. If name doesn't exist, create a new ACTIVE topic.
- If neither is provided: use the channel's default ("General") topic_id.
- If the resolved topic is RESOLVED or ARCHIVED: reopen it to ACTIVE.
- Store `topic_id` on the message row.

**`POST /api/channels/{channelId}/messages/{messageId}/replies`:**
- If `topicId` or `topic` is provided: use it (same resolution as above).
- If neither is provided: inherit the parent message's `topic_id`.

### WebSocket protocol changes

New `topics` dataset added to the snapshot:

```
TOPIC_COLUMNS: [topicId, channelId, name, state, messageCount, latestActivityTs, createdAt]
```

Message rows: index 8 changes from hardcoded `"General"` to the message's `topic_id` (UUID).

Broadcast ops for topic changes:
- `topics` / `append` — new topic created
- `topics` / `replace` — rename, state change, or message count update
- `topics` / `remove` — topic merged (absorbed into another)

---

## 3. Frontend — blocks-ui-channel-activity

### New types

```typescript
export const TOPIC_STATES = ['ACTIVE', 'RESOLVED', 'ARCHIVED', 'MERGED'] as const;
export type TopicState = typeof TOPIC_STATES[number];

export interface QhorusTopic {
  readonly id: string;
  readonly channelId: string;
  readonly name: string;
  readonly state: TopicState;
  readonly messageCount: number;
  readonly latestActivityTs?: string;
  readonly createdAt: string;
}
```

`QhorusMessage` gains `topicId: string` (stable ID for filtering/grouping, alongside existing `topic: string` which carries the display name).

### New events

```typescript
SELECT_TOPIC: 'channel:select-topic',       // { channelId, topicId: string | null }
VIEW_MODE: 'channel:view-mode',             // { mode: 'flat' | 'threaded' | 'topics' }
CREATE_TOPIC: 'channel:create-topic',       // { channelId, name }
RESOLVE_TOPIC: 'channel:resolve-topic',     // { channelId, topicId }
REOPEN_TOPIC: 'channel:reopen-topic',       // { channelId, topicId }
ARCHIVE_TOPIC: 'channel:archive-topic',     // { channelId, topicId }
RENAME_TOPIC: 'channel:rename-topic',       // { channelId, topicId, newName }
MERGE_TOPIC: 'channel:merge-topic',         // { channelId, sourceTopicId, targetTopicId }
```

### New component: `<channel-topic-bar>`

Horizontal scrollable bar rendered above the channel-feed.

**Props:**
- `topics: QhorusTopic[]`
- `selectedTopicId: string | null` (null = "All")
- `viewMode: 'flat' | 'threaded' | 'topics'`
- `showArchived: boolean`

**Renders:**
- "All" pill (always first, selected when `selectedTopicId` is null)
- Topic pills sorted: ACTIVE by latest activity descending, then RESOLVED (dimmed) at end, ARCHIVED only if `showArchived`
- Each pill: topic name, message count badge, state indicator dot (green/gray/hollow)
- Selected pill: accent background
- View mode toggle: Flat / Threaded / Topics buttons
- Context menu on pills (right-click or overflow): Resolve, Reopen, Archive, Rename, Merge into...

**Accessibility:** `RovingTabindexMixin` for keyboard navigation across pills. `aria-pressed` on selected pill. View mode toggle uses `role="radiogroup"`.

### `<channel-feed>` changes

New props:
- `viewMode: 'flat' | 'threaded' | 'topics'` (default: `'flat'`)
- `topics: QhorusTopic[]` (for topic section headers in Topics mode)

Rendering by mode:
- **flat** — current behavior unchanged. Chronological, sender-grouped, inline thread expansion.
- **threaded** — group all messages by root parent chain. Each group renders as a `<channel-thread>`. Messages with no parent and no replies render as standalone single-message entries.
- **topics** — group messages by `topicId`, render topic section headers (name + state badge + message count). Chronological within each section. ACTIVE topics first, RESOLVED dimmed, ARCHIVED dimmed + italic.

Filtering is NOT the feed's responsibility — the workbench filters messages before passing them. In Topics mode with "All" selected, the feed receives all messages and groups by topic. With a specific topic selected, it receives only that topic's messages.

### `<channel-input>` changes

New props:
- `topic: string` — current topic name (display)
- `topicId: string` — current topic ID
- `topics: QhorusTopic[]` — for autocomplete dropdown
- `showTopicSelector: boolean` — progressive disclosure

Topic selector UI:
- Pill above the textarea showing current topic name
- Click opens autocomplete dropdown listing existing ACTIVE + RESOLVED topics
- "Create new topic..." option at bottom of dropdown
- Selecting a topic updates the pill
- Send includes `topicId` (existing topic) or `topic` name (new topic) in `SendMessagePayload`

When replying: inherits parent message's topic by default. The topic pill shows the inherited topic. User can override by clicking the pill.

---

## 4. Frontend — chat-app wiring

### Adapter changes (`ChatDemoAdapter`)

- New array: `topics: QhorusTopic[]`
- New method: `_applyTopics(op)` — processes snapshot/append/replace/remove on topics dataset
- `_toMessage()`: maps `row[8]` as `topicId`, resolves topic name from `topics` array to set `topic`
- `_notify('topics')` fires on topic dataset changes

### Workbench changes (`QhorusWorkbench`)

New state:
```typescript
@state() private _topics: QhorusTopic[] = [];
@state() private _selectedTopicId: string | null = null;
@state() private _viewMode: 'flat' | 'threaded' | 'topics' = 'flat';
```

Modified `_onDataChange`: copies `_adapter.topics`.

Modified `_filteredMessages()`:
```typescript
private _filteredMessages(): QhorusMessage[] {
  if (!this._selectedChannelId) return [];
  let msgs = this._messages.filter(m => m.channelId === this._selectedChannelId);
  if (this._selectedTopicId) {
    msgs = msgs.filter(m => m.topicId === this._selectedTopicId);
  }
  return msgs;
}
```

Modified `_renderChat()`:
- Renders `<channel-topic-bar>` above feed when channel topics > 1
- Passes `viewMode`, `topics` to feed
- Passes `topic`, `topicId`, `topics`, `showTopicSelector` to input
- Default topic for input: selected topic from navigator bar, or channel's "General"

Modified `_sendMessage()`: includes `topicId` (existing) or `topic` name (new) in REST body.

New event handlers in `_onChatEvent`:
- `SELECT_TOPIC` → updates `_selectedTopicId`
- `VIEW_MODE` → updates `_viewMode`
- `RESOLVE_TOPIC` / `ARCHIVE_TOPIC` / `REOPEN_TOPIC` → `PUT /api/channels/{channelId}/topics/{topicId}` with state
- `RENAME_TOPIC` → `PUT` with new name
- `MERGE_TOPIC` → `POST .../merge` with targetTopicId
- `CREATE_TOPIC` → `POST /api/channels/{channelId}/topics` with name

---

## 5. Progressive Disclosure

| Condition | Topic bar | Topic selector in input | View mode toggle |
|-----------|-----------|------------------------|-----------------|
| Channel has 1 topic ("General" only) | Hidden | Hidden | Hidden |
| Channel has 2+ non-MERGED topics | Visible | Visible | Visible |
| All topics except General are MERGED | Hidden | Hidden | Hidden |

**Channel switch:** `_selectedTopicId` resets to `null` (All). `_viewMode` persists (user preference).

**New topic via input:** When a user creates a new topic and sends a message, the navigator bar auto-selects that topic.

**Message to resolved/archived topic:** Backend reopens to ACTIVE. Topic bar updates via WebSocket broadcast.

---

## 6. Seed Data

Update demo seed to showcase multi-topic channels:

**Channel "engineering":**
- "General" (default) — 4 messages, casual discussion
- "deployment-pipeline" — 6 messages, ACTIVE, agent COMMAND/STATUS/DONE chain about CI fix
- "incident-2024-03" — 5 messages, RESOLVED, investigation with human + agent collaboration

**Channel "case-investigation":**
- "General" — 2 messages
- "evidence-review" — 8 messages, ACTIVE, document artifact references
- "timeline-reconstruction" — 5 messages, ACTIVE, correlation chains
- "witness-analysis" — 3 messages, ARCHIVED

This showcases: progressive disclosure (multi-topic channels show the topic bar), lifecycle states (resolved, archived), topic view mode (grouping visible), and the topic selector (messages tagged to different topics).

---

## 7. Testing Strategy

### blocks-ui-channel-activity (vitest + jsdom)

**`channel-topic-bar` (new):**
- Renders "All" pill + topic pills from props
- Sort order: ACTIVE by latest activity, RESOLVED dimmed at end, ARCHIVED hidden/shown by toggle
- Emits `channel:select-topic` on pill click with correct topicId
- Emits `channel:view-mode` on toggle click
- Context menu: emits resolve/reopen/archive/rename/merge events with correct payloads
- Keyboard: arrow keys navigate pills, Enter selects
- Does not render when topics array has ≤ 1 entry (tested at consumer level)

**`channel-feed` (modified):**
- Flat mode: existing behavior unchanged (regression suite)
- Threaded mode: groups by root parent, renders channel-thread per group, standalone messages render individually
- Topics mode: groups by topicId, renders section headers with topic name + state badge, chronological within sections
- Empty topic sections not rendered
- `viewMode` prop defaults to 'flat'

**`channel-input` (modified):**
- Topic selector visible when `showTopicSelector` is true, hidden when false
- Autocomplete lists ACTIVE + RESOLVED topics, excludes ARCHIVED and MERGED
- "Create new topic" option present in dropdown
- Send payload includes topicId (existing topic) or topic name (new topic)
- Reply inherits parent topic, overridable via selector

### chat-app backend (JUnit)

**`SqliteChatBackend`:**
- `createTopic` / `listTopics` / `findTopic` / `updateTopic` / `mergeTopic` CRUD
- Default "General" topic auto-created with channel
- Topic name uniqueness constraint within channel
- Merge rewrites message topic_id, sets source MERGED with merged_into
- Rename updates name only, messages unchanged
- State transitions enforce valid paths
- Cannot merge/archive default topic
- Cannot merge into MERGED topic
- Message storage with topic_id FK

**`ChatResource`:**
- POST message with topic name → resolves to correct topic_id
- POST message with unknown topic name → creates new topic
- POST message with no topic → defaults to "General"
- POST reply → inherits parent topic unless overridden
- POST reply with explicit different topic → uses specified topic
- Message to RESOLVED/ARCHIVED topic → reopens to ACTIVE
- Topic REST endpoints: create (201/409), list (with state filter), update (rename/state), merge (400 on invalid)

**`ChatWebSocketBroadcaster`:**
- Snapshot includes topics dataset with correct columns
- Message rows carry topicId at index 8
- Topic create → append op
- Topic rename/state change → replace op
- Topic merge → remove op for source, replace for target

### chat-app frontend (vitest)

**`ChatDemoAdapter`:**
- Processes topics dataset ops (snapshot, append, replace, remove)
- `_toMessage` maps topicId from row[8], resolves topic name from topics array
- Unknown topicId falls back to empty string for topic name

**`QhorusWorkbench`:**
- Topic bar rendered when channel has >1 non-MERGED topic, hidden otherwise
- `_filteredMessages` filters by selectedTopicId when set
- selectedTopicId resets to null on channel switch
- viewMode persists across channel switches
- Topic lifecycle events → correct REST calls
- `_sendMessage` includes topic in body
- Auto-select topic on new topic creation + message send
