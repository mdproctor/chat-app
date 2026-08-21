# Space-Based Channel Hierarchy — Design Spec

**Issue:** casehubio/chat-app#7
**Phase:** 4 — space-based channel hierarchy
**Dependencies:** connectors#61 (CLOSED), qhorus#328 (CLOSED)
**Date:** 2026-08-20

## Summary

Replace the flat channel list in `blocks-channel-nav` with a tree navigation that groups channels by space. Normative triples (work/observe/oversight) appear under collapsible case space nodes with combined unread counts. Standalone channels (no space) render at root level above space groups.

The backend infrastructure is already complete: `Space` domain model with hierarchical `parentSpaceId`, `Channel.spaceId` for space membership, `SpaceStore` with tree queries, and `ChannelStateController` with `channelTree` getter and `SpaceNode`/`ChannelTree` interfaces. The qhorus push module (`QhorusDatasetBuilder`) already emits 8-column channel snapshots with space data (positions 5-7). Chat-app's `ChatDatasetBuilder` is a stale 5-column fork that masks this — the snapshot path is the only thing preventing space data from reaching the frontend.

## Scope

**In scope:**
- Delete stale chat-app forks left over from #33 consolidation: `ChatDatasetBuilder`, `ChatPushWebSocket`, `PushInfrastructure` — the canonical implementations (`QhorusDatasetBuilder`, `QhorusPushWebSocket`, `QhorusPushInfrastructure`) in qhorus-push already serve these roles
- Extend `ChannelStateController._toChannel()` to parse unread count
- Extend `channelTree` getter to compute aggregated unread counts
- Add `spaceId`, `spaceName`, `parentSpaceId`, `unreadCount` to `QhorusChannel` type
- Add grouped tree rendering to `ChannelNavElement` (data-driven — `channelTree` prop triggers tree mode)
- Keyboard accessibility for tree navigation
- Wire workbench to pass `channelTree` instead of flat `channels`
- Seed data with spaces and normative triple channels
- Tests at all layers

**Out of scope (D3):**
- Space CRUD operations in the nav (#34)
- Empty space visibility (#35)
- Space management UI — context menus, drag-and-drop (#36)
- Multi-level space nesting rendering (#37) — the `Space` model supports it via `parentSpaceId`, but the nav renders a single nesting level for now (space → channels)

## Architecture

Three layers change (the backend push layer is already done in qhorus):

```
QhorusDatasetBuilder  →  push snapshot  →  ChannelStateController  →  channel-nav
     (qhorus-push)        (JSON rows)         (blocks-ui)               (blocks-ui)
```

**Relationship to #33 (consolidation):** Issue #33 (CLOSED) created the qhorus-push module with canonical implementations (`QhorusDatasetBuilder`, `QhorusPushWebSocket`, `QhorusPushInfrastructure`, `QhorusWebSocketBroadcaster`). The chat-app copies (`ChatDatasetBuilder`, `ChatPushWebSocket`, `PushInfrastructure`) are stale leftovers from incomplete cleanup during that merge. This spec completes the deletion. `QhorusPushWebSocket` at `/ws/push` replaces `ChatPushWebSocket`, and the per-user unread count enhancement goes directly into `QhorusDatasetBuilder`.

### Layer 1: Backend — delete stale forks, add unread counts (chat-app + qhorus)

**Discovery:** Chat-app has two dataset builders on the classpath:

| Class | Location | Channel columns | Space data |
|-------|----------|----------------|------------|
| `QhorusDatasetBuilder` | qhorus-push module (dependency) | 8 columns (0-7) | positions 5-7 with batch `SpaceStore.findByIds()` |
| `ChatDatasetBuilder` | chat-app local source | 5 columns (0-4) | missing |

`ChatDatasetBuilder` is a stale fork of `QhorusDatasetBuilder` that predates the space column additions. Every method is identical except `buildChannelSnapshot()` (which is missing space data) and `CHANNEL_COLUMNS` (5 vs 8). It has no unique functionality.

The real-time path already works: `BroadcastingChannelManager` → `QhorusWebSocketBroadcaster.broadcastChannelAppend()` sends 8-column rows with space data. But the snapshot path (WebSocket connect) goes through `ChatPushWebSocket` → `ChatDatasetBuilder` → 5 columns.

**Fix:**

1. **Delete `ChatDatasetBuilder.java`** — stale 5-column fork of `QhorusDatasetBuilder`
2. **Delete `ChatPushWebSocket.java`** — stale fork of `QhorusPushWebSocket` (both register at `/ws/push`)
3. **Delete `PushInfrastructure.java`** — stale fork of `QhorusPushInfrastructure` (both produce `EventStore`, `TopicRegistry`, `EventBroadcaster` singletons)
4. `QhorusPushWebSocket` (qhorus-push) becomes the sole WebSocket endpoint — space data in snapshots (positions 5-7) works immediately via `QhorusDatasetBuilder.buildChannelSnapshot()`

**Unread counts (position 8):**

`QhorusDatasetBuilder` builds snapshots without user context — the same data goes to all users. Per-user unread counts require knowing the current principal.

**Approach:** Add a `buildChannelSnapshot(String userId, String tenancyId)` overload to `QhorusDatasetBuilder` in qhorus-push. This is a cross-repo change but aligns with the completed #33 consolidation — all push dataset logic lives in qhorus-push.

The overloaded method delegates to `ChannelMembershipService.getUnreadCounts(userId, tenancyId)` (exposed through a qhorus-api interface) to compute correct per-user unread counts. The existing algorithm:
1. Queries messages WHERE id > `lastReadMessageId` for each channel membership
2. Excludes `MessageType.EVENT` messages
3. Subtracts the user's own messages sent after the read cursor

This produces the `UnreadCount` record (`channelId`, `channelName`, `count`, `latestMessageId`), which maps to position 8 in each channel row.

| Position | Name | Source |
|----------|------|--------|
| 8 | unreadCount | `UnreadCountProvider.getUnreadCounts()` — count of non-EVENT, non-own messages after `lastReadMessageId` |

**API interface for unread counts:** `ChannelMembershipService.getUnreadCounts()` exists only on the qhorus-runtime implementation — not on any qhorus-api interface. `QhorusDatasetBuilder` injects from qhorus-api only. The computation crosses store boundaries (membership + message stores), so it doesn't belong on `MembershipReader` or `MembershipManager`.

New qhorus-api interface:

```java
public interface UnreadCountProvider {
    Map<UUID, UnreadCount> getUnreadCounts(String memberId, String tenancyId);
}
```

`ChannelMembershipService` (qhorus-runtime) implements this — the computation logic already exists. `QhorusDatasetBuilder` injects `UnreadCountProvider` and calls it in the user-aware snapshot overload.

**Snapshot vs broadcast column handling:** The snapshot path uses an extended column list (`CHANNEL_COLUMNS` + `PushColumn("unreadCount", "Unread", "LABEL")`) to include position 8. The broadcast path (`broadcastChannelAppend()`) continues to use the existing 8-column `CHANNEL_COLUMNS` — unread counts are not broadcast because they are per-user. The `_toChannel()` parser handles variable-width rows gracefully (conditional check on `row[8]`).

**User identity in WebSocket:** `QhorusPushWebSocket` needs `CurrentPrincipal` injection to pass user identity to the snapshot builder. In chat-app, `ChatAppCurrentPrincipal` implements `CurrentPrincipal` via `SecurityIdentity` from JWT validation. The `WebSocketTokenUpgradeCheck` validates the JWT on WebSocket upgrade; Quarkus WebSocket Next propagates the resulting security context to `@OnTextMessage` handlers via CDI.

**Snapshot dispatch routing:** `QhorusPushWebSocket.onMessage()` currently dispatches all topics uniformly via `datasetBuilder.buildSnapshot(topic)`. The user-aware channel snapshot requires a special code path. Add a `buildSnapshot(String topic, Long seq, String userId, String tenancyId)` entry point to `QhorusDatasetBuilder` where the dispatch handles the principal internally — the channel topic routes to the user-aware overload, all other topics ignore the identity parameters and delegate to the existing no-user path.

**`BroadcastingChannelManager` — no changes needed.** It delegates to `QhorusWebSocketBroadcaster.broadcastChannelAppend()` which already sends 8 columns. Unread count is not sent on individual channel appends (it starts at 0 for new channels).

### Layer 2: Frontend types — QhorusChannel (blocks-ui)

**File:** `components/channel-activity/src/types.ts`

Add optional fields to `QhorusChannel`:

```typescript
export interface QhorusChannel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly semantic: ChannelSemantic;
  readonly allowedTypes?: readonly MessageType[];
  readonly deniedTypes?: readonly MessageType[];
  readonly paused: boolean;
  readonly spaceId?: string;        // new
  readonly spaceName?: string;      // new
  readonly parentSpaceId?: string;  // new
  readonly unreadCount?: number;    // new
}
```

### Layer 3: Frontend controller — ChannelStateController (blocks-ui)

**File:** `components/channel-activity/src/channel-state-controller.ts` (in JAR — source in blocks-ui repo)

**`_toChannel()` extension:** Add position 8 parsing for unread count. Positions 5-7 already parsed.

```typescript
const unreadCount = row[8] as string;
if (unreadCount) (ch as { unreadCount: number }).unreadCount = parseInt(unreadCount, 10) || 0;
```

**`channelTree` getter — unread aggregation:** Replace hardcoded `unreadCount: 0` with computed sums:

```typescript
// For each SpaceNode:
const channelUnread = node.channels.reduce((sum, ch) => sum + (ch.unreadCount ?? 0), 0);
const childrenUnread = node.children.reduce((sum, child) => sum + child.unreadCount, 0);
// SpaceNode.unreadCount = channelUnread + childrenUnread
```

**Real-time unread tracking:** After the initial snapshot provides server-computed unread counts, the controller tracks changes locally:

- **Message append on non-selected channel:** When `_applyMessages()` processes an append op, for each message where `channelId !== selectedChannelId`, increment that channel's `unreadCount`. Exclude `EVENT` type messages (position 6) and the current user's own messages (position 3 matches current userId).
- **Channel select:** When `handleEvent(SELECT_CHANNEL)` fires, reset the selected channel's `unreadCount` to 0. The controller does NOT call the REST endpoint — it emits state changes only. The workbench intercepts `SELECT_CHANNEL` and calls `ChatResource.markRead()` via `authenticatedFetch()` with the latest message ID (same pattern as `SEND_MESSAGE` interception in `_onChatEvent`).
- **Snapshot refresh:** On reconnect, the full snapshot replaces all counts with fresh server-computed values, correcting any drift.

The controller needs the current user ID (for own-message exclusion). This is passed as a constructor parameter or set via a `setCurrentUser(userId)` method, wired from the workbench's identity state.

The `channelTree` getter's unread aggregation (`SpaceNode.unreadCount = sum of child channel unreadCounts`) reacts automatically because it reads from the channel objects that the tracking logic updates.

### Layer 4: Frontend component — ChannelNavElement (blocks-ui)

**File:** `components/channel-activity/src/channel-nav.ts`

#### Property API — data-driven mode selection

```typescript
@property({ type: Array })  channels: QhorusChannel[] = [];        // flat mode (existing)
@property({ type: Object }) channelTree?: ChannelTree;              // grouped mode (new)
```

**Unread count source of truth:** The existing `messageCounts` prop is removed. Unread counts flow through the channel data model — each `QhorusChannel` carries `unreadCount` from the push snapshot, updated in real-time by `ChannelStateController` (§Layer 3). The nav reads `channel.unreadCount` directly. `SpaceNode.unreadCount` aggregates these in tree mode. No external count mapping needed. No current consumer wires `messageCounts`, so this is a no-impact deletion.

Render logic:
- `channelTree` set → grouped tree rendering (sidebar layout only)
- `channelTree` absent → flat list rendering (backward compatible)
- `layout === 'dropdown'` → always flat (dropdown doesn't support tree)

#### Grouped rendering

```
┌─────────────────────────┐
│ # general          (3)  │  ← ungrouped channels (above space groups)
│ # engineering           │
│ # design                │
│ # random                │
│                         │
│ ▾ Case Alpha       (5)  │  ← space group header with combined unread
│   # work                │    ← normative triple channels
│   # observe        (5)  │
│   # oversight           │
│                         │
│ ▸ Case Beta        (2)  │  ← collapsed space group
│                         │
│ ▾ Case Gamma            │  ← expanded, no unread
│   # work                │
│   # observe             │
│   # oversight           │
│                         │
│ [+ Create Channel]      │
└─────────────────────────┘
```

#### Collapse state

```typescript
@state() private _expandedSpaces = new Set<string>();
```

On first render with `channelTree`, populate with all space IDs (default expanded). Toggle on header click. Space group headers show disclosure triangle (▸/▾).

**Edge cases:**
- **New space appears after initial render** (broadcast adds a channel in a previously unseen space): Auto-expand the new space — the user should see new content without manual interaction.
- **Snapshot refresh on reconnect:** Preserve expansion state — the `Set<string>` persists across data updates. Only add newly seen space IDs; don't reset existing collapse decisions.

#### Space group header styling

- Same visual weight as channel items — no heavy dividers or section breaks
- Slightly bolder text, disclosure triangle, combined unread badge
- Not selectable as a channel — click only toggles collapse
- Unread badge shows `SpaceNode.unreadCount` (sum of all child channel unread counts)
- Badge hidden when count is 0

#### Channel item rendering

Shared between flat and grouped paths. Each channel item shows:
- `#` icon (existing `getChannelIcon()`)
- Channel name (truncated with ellipsis)
- Per-channel unread badge from `channel.unreadCount`
- Delete button on hover (existing, when `showDelete` is true)

#### Keyboard navigation

Replace flat `_focusedIndex` (integer into flat array) with a logical item list:

1. Build a flat traversal list from the tree: `[ungrouped-channel, ..., space-header, child-channel, ..., space-header, ...]`
2. Collapsed space groups contribute only their header to the list (children skipped)
3. ArrowUp/ArrowDown moves through the traversal list
4. Enter on a channel item → select channel (existing behaviour)
5. Enter/Space on a space header → toggle expand/collapse
6. Focus styling on the current item (existing `.focused` class)

### Layer 5: Workbench wiring (chat-app)

**File:** `src/main/webui/src/workbench/qhorus-workbench.ts`

`_renderNav()` changes from:

```typescript
<blocks-channel-nav
  .channels=${this._channels.channels}
  .selectedChannelId=${this._channels.selectedChannelId}>
```

to:

```typescript
<blocks-channel-nav
  .channelTree=${this._channels.channelTree}
  .selectedChannelId=${this._channels.selectedChannelId}>
```

The `channelTree` getter on `ChannelStateController` already exists — this is pure wiring.

**userId wiring:** The controller needs the current user ID for own-message exclusion in real-time tracking (§Layer 3). The workbench passes it after authentication:

```typescript
private _channels = new ChannelStateController(this, this._push);

// In firstUpdated() or after identity resolution:
this._channels.setCurrentUser(getActorId());
```

The workbench already has identity state via `getToken()` and the `identities` prop. `getActorId()` extracts the actor ID from the JWT claims (same source as `ChatAppCurrentPrincipal` on the server side).

**markRead wiring:** The workbench intercepts `SELECT_CHANNEL` in `_onChatEvent` and calls `ChatResource.markRead()`:

```typescript
if (topic === ChannelEventTopics.SELECT_CHANNEL) {
  const { channelId } = payload as SelectChannelPayload;
  const latestId = this._channels.latestMessageId(channelId);
  if (latestId) authenticatedFetch(`/api/chat/${channelId}/read`, {
    method: 'PUT', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ lastReadMessageId: latestId }),
  });
}
```

### Layer 6: Seed data (chat-app)

Seed via startup bean or `import.sql` — whichever the app currently uses for demo data.

**Spaces (3 root-level):**

| Name | parentSpaceId | Purpose |
|------|--------------|---------|
| Case Alpha | null | Primary demo case |
| Case Beta | null | Secondary demo case |
| Case Gamma | null | Tertiary demo case |

**Channels (13 total):**

| Channel | spaceId | Semantic |
|---------|---------|----------|
| general | null | APPEND |
| engineering | null | APPEND |
| design | null | APPEND |
| random | null | APPEND |
| alpha-work | Case Alpha | APPEND |
| alpha-observe | Case Alpha | APPEND |
| alpha-oversight | Case Alpha | APPEND |
| beta-work | Case Beta | APPEND |
| beta-observe | Case Beta | APPEND |
| beta-oversight | Case Beta | APPEND |
| gamma-work | Case Gamma | APPEND |
| gamma-observe | Case Gamma | APPEND |
| gamma-oversight | Case Gamma | APPEND |

Sample messages distributed across channels to produce non-zero unread counts.

## Cross-Repo Impact

This feature touches **three repos**:

| Repo | Changes | Reason |
|------|---------|--------|
| **chat-app** | Delete stale forks: `ChatDatasetBuilder`, `ChatPushWebSocket`, `PushInfrastructure` (completing #33 cleanup). Workbench wiring (`channelTree` prop), seed data, tests | App-specific wiring, demo data, stale fork cleanup |
| **blocks-ui** | `types.ts` (space/unread fields on `QhorusChannel`), `channel-state-controller.ts` (unread tracking, `channelTree` aggregation), `channel-nav.ts` (tree rendering, remove `messageCounts` prop), tests | Shared component library — type extensions, controller parser, nav rendering |
| **qhorus** | `QhorusDatasetBuilder` — add `buildChannelSnapshot(String userId, String tenancyId)` overload with unread counts at position 8. `QhorusPushWebSocket` — inject `CurrentPrincipal`, pass identity to snapshot builder. Expose `getUnreadCounts` through API-layer interface. | Per-user unread count support in push snapshots |

blocks-ui changes: new optional fields on `QhorusChannel`, new optional `channelTree` prop on `ChannelNavElement`, controller parses new positions gracefully (nulls for missing data). The `messageCounts` prop on `ChannelNavElement` is removed — unread counts now flow through `QhorusChannel.unreadCount`. No current consumer wires `messageCounts`, so this is a no-impact deletion.

No other repos consume `blocks-channel-nav` or `ChannelStateController` at this time.

## Testing Strategy

### Backend (Java — JUnit)
- Verify `QhorusPushWebSocket` produces 8+ column channel snapshots with space data (after stale fork deletion)
- Verify `buildChannelSnapshot(userId, tenancyId)` includes correct per-user unread counts at position 8
- Unread count computation: 0 when no membership, correct delta when lastReadMessageId is set, excludes EVENT and own messages
- Existing `ChatDatasetBuilderTest` adapted to test `QhorusDatasetBuilder` directly

### Frontend (TypeScript — vitest)
- `channel-nav.test.ts`: Grouped mode renders space groups with headers and nested channels
- Flat mode unchanged when only `channels` passed (backward compat)
- Collapse/expand toggles space group visibility
- Unread badges render on channels and space headers, hidden when 0
- Keyboard navigation traverses tree correctly, skips collapsed groups
- `channel-state-controller.test.ts` (new or extend): `channelTree` unread aggregation sums correctly
- Real-time unread tracking: increment on message append for non-selected channel, exclude EVENT and own messages, reset to 0 on channel select, drift correction when snapshot replaces tracked counts on reconnect

### E2E (playwright)
- Tree renders with seed data: 4 standalone + 3 space groups
- Click space header collapses/expands
- Channel selection works within space groups
- Unread badges visible on channels with messages

## References

- `ChannelStateController` (blocks-ui JAR) — `channelTree` getter, `SpaceNode`/`ChannelTree` interfaces, `_toChannel()` parser
- `QhorusDatasetBuilder.java` (qhorus-push) — canonical 8-column channel snapshot with space data and batch `SpaceStore.findByIds()`
- `QhorusWebSocketBroadcaster.java` (qhorus-push) — real-time channel append already sends 8 columns with space data
- `ChatDatasetBuilder.java` (chat-app) — **stale 5-column fork to be deleted** — masks space data in snapshot path
- `ChatPushWebSocket.java` (chat-app) — **stale fork to be deleted** — `QhorusPushWebSocket` (qhorus-push) is canonical
- `PushInfrastructure.java` (chat-app) — **stale fork to be deleted** — `QhorusPushInfrastructure` (qhorus-push) is canonical
- `ChannelMembershipService.java` (qhorus-runtime) — `getUnreadCounts(memberId, tenancyId)` — correct unread count computation
- `Channel.java` (qhorus-api) — `spaceId` field at line 24
- `Space.java` (qhorus-api) — hierarchical space model with `parentSpaceId`
- `SpaceStore.java` (qhorus-api) — `findByIds()` for batch resolution
- `channel-nav.ts` (blocks-ui) — current flat rendering, `messageCounts` prop, keyboard nav
- `qhorus-workbench.ts` (chat-app) — `_renderNav()` wiring, `ChannelStateController` consumption
- `ChatResource.markRead()` (chat-app) — existing read-tracking endpoint
- Decision review: `/Users/mdproctor/reviews/casehub-chat-app/issue-7-decision-20260820-202549/`
