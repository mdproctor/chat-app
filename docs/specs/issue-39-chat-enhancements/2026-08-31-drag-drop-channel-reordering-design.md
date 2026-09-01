# Design: Drag-and-Drop Channel Reordering Between Spaces

**Issue:** casehubio/chat-app#39
**Date:** 2026-08-31
**Status:** Draft

## Summary

Add drag-and-drop interaction to `blocks-channel-nav` for moving channels between spaces and reordering channels within a space. The existing context menu "Move to Space" provides the same move operation — D&D adds positional precision (drop between channels to insert at a specific position) and a faster interaction path.

## Scope

**In scope:**
- Drag channel items to space headers or between channels in any space
- Reorder channels within the same space via drag
- Drop on ungrouped area to remove from a space
- Positional drops: inserting at a specific position within a space
- Backend support for channel display ordering (new `displayOrder` field)

**Out of scope:**
- Dragging spaces to reorder spaces themselves
- Touch/mobile drag support (desktop chat workbench only)

## Architecture

Three repos are modified: qhorus (backend ordering), blocks-ui (D&D interaction), chat-app (REST endpoint + push column).

### Layer 1: qhorus-api — Channel ordering field

Add `Integer displayOrder` to the `Channel` record. Nullable — channels without an explicit order sort after ordered channels, then by name.

```java
public record Channel(
    // ... existing 24 fields ...
    Integer displayOrder,   // position within space (or ungrouped), nullable
    // ... rest unchanged
) { ... }
```

Add a builder method: `toBuilder().displayOrder(n).build()`.

### Layer 2: qhorus runtime — SpaceService changes

Extend `SpaceService.moveChannelToSpace`:

```java
@Transactional
public Channel moveChannelToSpace(UUID channelId, UUID spaceId, Integer position) {
    Channel channel = channelStore.find(channelId)
        .orElseThrow(() -> new IllegalArgumentException("Channel not found"));
    if (spaceId != null) {
        spaceStore.find(spaceId)
            .orElseThrow(() -> new IllegalArgumentException("Space not found"));
    }

    // No-op detection: same space, same position → early return
    UUID oldSpaceId = channel.spaceId();
    boolean sameSpace = Objects.equals(oldSpaceId, spaceId);
    if (sameSpace && position != null) {
        List<Channel> current = querySiblings(spaceId).stream()
            .sorted(Comparator.comparing(Channel::displayOrder,
                Comparator.nullsLast(Comparator.naturalOrder())))
            .toList();
        int currentIndex = -1;
        for (int i = 0; i < current.size(); i++) {
            if (current.get(i).id().equals(channelId)) { currentIndex = i; break; }
        }
        if (currentIndex == position) return channel;
    }

    // Get siblings in target space, sorted by displayOrder
    List<Channel> siblings = querySiblings(spaceId);
    siblings = siblings.stream()
        .filter(ch -> !ch.id().equals(channelId))
        .sorted(Comparator.comparing(Channel::displayOrder,
            Comparator.nullsLast(Comparator.naturalOrder())))
        .collect(Collectors.toList());

    // Insert at position (or append if null)
    if (position != null && position >= 0 && position <= siblings.size()) {
        siblings.add(position, channel);
    } else {
        siblings.add(channel);
    }

    // Reassign displayOrder for all siblings in target space
    for (int i = 0; i < siblings.size(); i++) {
        Channel sib = siblings.get(i);
        Channel updated = sib.toBuilder()
            .spaceId(spaceId)
            .displayOrder(i)
            .build();
        if (!updated.equals(sib)) {
            channelStore.put(updated);
        }
    }

    // Renumber source space if the channel changed spaces
    if (!sameSpace) {
        List<Channel> sourceSiblings = querySiblings(oldSpaceId);
        sourceSiblings = sourceSiblings.stream()
            .filter(ch -> !ch.id().equals(channelId))
            .sorted(Comparator.comparing(Channel::displayOrder,
                Comparator.nullsLast(Comparator.naturalOrder())))
            .collect(Collectors.toList());
        for (int i = 0; i < sourceSiblings.size(); i++) {
            Channel sib = sourceSiblings.get(i);
            Channel updated = sib.toBuilder().displayOrder(i).build();
            if (!updated.equals(sib)) {
                channelStore.put(updated);
            }
        }
    }

    Channel result = channelStore.find(channelId).orElseThrow();
    mutationEvent.fire(new ChannelMutationEvent.ChannelMoved(
        channelId, oldSpaceId, spaceId));
    return result;
}

private List<Channel> querySiblings(UUID spaceId) {
    return spaceId != null
        ? channelStore.scan(ChannelQuery.bySpaceId(spaceId))
        : channelStore.scan(ChannelQuery.topLevel());
}
```

The existing 2-argument overload remains for backward compatibility — delegates to `moveChannelToSpace(channelId, spaceId, null)` (append to end).

**Persistence:** Add `display_order INTEGER` column to the channel table. Flyway migration in qhorus runtime.

**ChannelMutationEvent:** Add a new `ChannelMoved` record to the `ChannelMutationEvent` sealed interface:

```java
record ChannelMoved(UUID channelId, UUID sourceSpaceId, UUID targetSpaceId)
    implements ChannelMutationEvent {}
```

This is a new variant — the sealed interface currently has no channel-move event. The event is fired from `moveChannelToSpace` after persistence completes.

### Layer 3: qhorus push — displayOrder in dataset and channel replace broadcast

**Column layout:** Add `displayOrder` to `CHANNEL_COLUMNS` (at index 8). `CHANNEL_SNAPSHOT_COLUMNS` = `CHANNEL_COLUMNS` + unreadCount, so unreadCount shifts to index 9:

```java
public static final List<PushColumn> CHANNEL_COLUMNS = List.of(
    /* 0 */ new PushColumn("id", "ID", "LABEL"),
    /* 1 */ new PushColumn("name", "Name", "LABEL"),
    /* 2 */ new PushColumn("topic", "Topic", "LABEL"),
    /* 3 */ new PushColumn("description", "Description", "LABEL"),
    /* 4 */ new PushColumn("isPrivate", "Private", "LABEL"),
    /* 5 */ new PushColumn("spaceId", "Space ID", "LABEL"),
    /* 6 */ new PushColumn("spaceName", "Space Name", "LABEL"),
    /* 7 */ new PushColumn("parentSpaceId", "Parent Space", "LABEL"),
    /* 8 */ new PushColumn("displayOrder", "Order", "LABEL"));  // NEW
// CHANNEL_SNAPSHOT_COLUMNS = CHANNEL_COLUMNS + [unreadCount at index 9]
```

**Extract `channelToRow` helper** to eliminate duplication between snapshot builder and broadcaster (following the existing `messageToRow`, `topicToRow`, `commitmentToRow` pattern):

```java
public List<String> channelToRow(Channel ch, Space space) {
    return List.of(
        ch.id().toString(), ch.name(), "",
        ch.description() != null ? ch.description() : "", "false",
        ch.spaceId() != null ? ch.spaceId().toString() : "",
        space != null ? space.name() : "",
        space != null && space.parentSpaceId() != null
            ? space.parentSpaceId().toString() : "",
        ch.displayOrder() != null ? String.valueOf(ch.displayOrder()) : "");
}
```

Update `buildChannelSnapshot` and `broadcastChannelAppend` to use `channelToRow`.

**Add `broadcastChannelReplace`** to `QhorusWebSocketBroadcaster`:

```java
public void broadcastChannelReplace(Channel channel) {
    Space space = channel.spaceId() != null
        ? spaceStore.find(channel.spaceId()).orElse(null) : null;
    eventBroadcaster.broadcast(QhorusDatasetBuilder.TOPIC_CHANNELS,
        PushMessage.replace("channels", QhorusDatasetBuilder.CHANNEL_COLUMNS,
            channel.id().toString(), datasetBuilder.channelToRow(channel, space)));
}
```

**Add `ChannelMoved` handler** to `onMutation`:

```java
case ChannelMutationEvent.ChannelMoved e -> {
    // Broadcast replace for all channels in affected spaces
    broadcastChannelsInSpace(e.targetSpaceId());
    if (!Objects.equals(e.sourceSpaceId(), e.targetSpaceId())) {
        broadcastChannelsInSpace(e.sourceSpaceId());
    }
}
```

`broadcastChannelsInSpace` handles both spaced and ungrouped (null spaceId) channels. Inject `ChannelReader` into the broadcaster:

```java
private void broadcastChannelsInSpace(UUID spaceId) {
    List<Channel> channels = spaceId != null
        ? channelReader.scan(ChannelQuery.bySpaceId(spaceId))
        : channelReader.scan(ChannelQuery.topLevel());
    for (Channel ch : channels) {
        broadcastChannelReplace(ch);
    }
}
```

### Layer 4: blocks-ui — D&D interaction in channel-nav.ts

#### 4a. Types and events

Extend `MoveChannelToSpacePayload`:

```typescript
export interface MoveChannelToSpacePayload {
  readonly channelId: string;
  readonly spaceId: string | null;
  readonly position?: number;  // insertion index; omit = append
}
```

Add `displayOrder?: number` to `QhorusChannel`:

```typescript
export interface QhorusChannel {
  // ... existing fields ...
  readonly displayOrder?: number;
}
```

#### 4b. State controller changes

Update `_toChannel` to parse `displayOrder` at index 8. Because `displayOrder` is added to `CHANNEL_COLUMNS`, the existing `unreadCount` (in `CHANNEL_SNAPSHOT_COLUMNS`) shifts to index 9:

```typescript
private _toChannel(row: unknown[]): QhorusChannel {
    // ... existing parsing through parentSpaceId (row[7]) ...
    const displayOrder = row[8] as string;  // NEW — was unreadCount
    const unreadCount = row[9] as string;   // SHIFTED from row[8] to row[9]
    if (displayOrder) (ch as { displayOrder: number }).displayOrder = parseInt(displayOrder, 10);
    if (unreadCount) (ch as { unreadCount: number }).unreadCount = parseInt(unreadCount, 10) || 0;
    return ch;
}
```

Add `replace` handling to `_applyChannels` (currently only handles snapshot, append, remove):

```typescript
private _applyChannels(op: DatasetOp) {
    if (op.op === 'snapshot') {
      this.channels = (op.rows ?? []).map(r => this._toChannel(r));
      // ... existing pending space cleanup ...
    } else if (op.op === 'append' && op.rows) {
      this.channels = [...this.channels, ...op.rows.map(r => this._toChannel(r))];
    } else if (op.op === 'replace' && op.row && op.key) {
      const existing = this.channels.find(c => c.id === op.key);
      const updated = this._toChannel(op.row);
      // Preserve client-side unreadCount — replace rows use CHANNEL_COLUMNS (no unreadCount)
      this.channels = this.channels.map(c =>
        c.id === op.key
          ? { ...updated, unreadCount: existing?.unreadCount ?? updated.unreadCount }
          : c);
    } else if (op.op === 'remove' && op.key) {
      this.channels = this.channels.filter(c => c.id !== op.key);
    }
}
```

Update `channelTree` getter to sort channels by `displayOrder` (nulls last, then by name):

```typescript
get channelTree(): ChannelTree {
    // ... existing grouping logic ...
    // After grouping, sort each space's channels
    for (const node of spaceMap.values()) {
        node.channels.sort((a, b) => {
            const oa = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
            const ob = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
            if (oa !== ob) return oa - ob;
            return a.name.localeCompare(b.name);
        });
    }
    // Sort ungrouped the same way
    ungrouped.sort((a, b) => {
        const oa = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
        const ob = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        return a.name.localeCompare(b.name);
    });
    // ... rest unchanged
}
```

Update `applyMoveChannel` to accept `position` and renumber all siblings in the target space (mirroring the backend logic to avoid sort inconsistency from displayOrder collisions):

```typescript
applyMoveChannel(channelId: string, spaceId: string | null,
                 spaceName: string | null, position?: number) {
    const channel = this.channels.find(ch => ch.id === channelId);
    if (!channel) return;

    // Build the moved channel with updated space
    let moved: QhorusChannel;
    if (spaceId) {
        moved = { ...channel, spaceId, spaceName: spaceName ?? undefined } as QhorusChannel;
    } else {
        const { spaceId: _, spaceName: _s, parentSpaceId: _p, ...rest } = channel;
        moved = rest as QhorusChannel;
    }

    // Get target space siblings (excluding moved channel), sorted by displayOrder
    const siblings = this.channels
        .filter(ch => ch.id !== channelId &&
            (spaceId ? ch.spaceId === spaceId : !ch.spaceId))
        .sort((a, b) => {
            const oa = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
            const ob = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
            return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
        });

    // Insert moved channel at position (or append)
    const pos = Math.min(position ?? siblings.length, siblings.length);
    siblings.splice(pos, 0, moved);

    // Build displayOrder map for all target siblings
    const reordered = new Map(siblings.map((ch, i) => [ch.id, i]));

    this.channels = this.channels.map(ch => {
        const newOrder = reordered.get(ch.id);
        if (newOrder !== undefined) {
            return ch.id === channelId
                ? { ...moved, displayOrder: newOrder } as QhorusChannel
                : { ...ch, displayOrder: newOrder };
        }
        return ch;
    });
    this._host.requestUpdate();
}
```

#### 4c. Drag-and-drop handlers in ChannelNavElement

**New state properties:**

```typescript
@state() private _dragChannelId: string | null = null;
@state() private _dropTarget: { spaceId: string | null; position: number } | null = null;
```

**Drag source — channel items:**

Add `draggable="true"` to all `.channel-item` elements in `_renderChannelItem`. Handle `dragstart` and `dragend`:

```typescript
private _onDragStart(e: DragEvent, channel: QhorusChannel) {
    this._dragChannelId = channel.id;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', channel.id);
}

private _onDragEnd() {
    this._dragChannelId = null;
    this._dropTarget = null;
}
```

**Drop targets — space headers and channel gaps:**

Each `.channel-item` within a space acts as a drop zone. On `dragover`, calculate whether the cursor is in the top or bottom half of the channel item to determine the insertion position:

```typescript
private _onChannelDragOver(e: DragEvent, spaceId: string | null,
                            index: number) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    let position = e.clientY < midY ? index : index + 1;

    // Compensate for same-space drag: visual indices include the dragged item,
    // but backend/optimistic update removes it before inserting. When the drag
    // source is above the hover target, the effective index is one less.
    if (this._dragChannelId) {
        const sourceIndex = this._getDragSourceIndex(spaceId);
        if (sourceIndex !== -1 && sourceIndex < position) {
            position--;
        }
    }
    this._dropTarget = { spaceId, position };
}

private _onSpaceHeaderDragOver(e: DragEvent, spaceId: string) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    // Drop on header = append to end of space
    this._dropTarget = { spaceId, position: -1 };
}

private _onDragLeave(e: DragEvent) {
    const related = e.relatedTarget as Node | null;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
        this._dropTarget = null;
    }
}

private _onUngroupedDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    let position = e.clientY < midY ? index : index + 1;

    if (this._dragChannelId) {
        const sourceIndex = this._getDragSourceIndex(null);
        if (sourceIndex !== -1 && sourceIndex < position) {
            position--;
        }
    }
    this._dropTarget = { spaceId: null, position };
}

private _getDragSourceIndex(spaceId: string | null): number {
    if (!this._dragChannelId || !this.channelTree) return -1;
    if (!spaceId) {
        return this.channelTree.ungrouped.findIndex(ch => ch.id === this._dragChannelId);
    }
    const findSpace = (nodes: SpaceNode[]): SpaceNode | undefined => {
        for (const n of nodes) {
            if (n.space.id === spaceId) return n;
            const child = findSpace(n.children);
            if (child) return child;
        }
        return undefined;
    };
    const node = findSpace(this.channelTree.spaces);
    return node?.channels.findIndex(ch => ch.id === this._dragChannelId) ?? -1;
}
```

**Drop handler:**

```typescript
private _onDrop(e: DragEvent) {
    e.preventDefault();
    if (!this._dragChannelId || !this._dropTarget) return;

    const { spaceId, position } = this._dropTarget;
    const pos = position === -1 ? undefined : position;

    emitPagesEvent(this, ChannelEventTopics.MOVE_CHANNEL_TO_SPACE, {
        channelId: this._dragChannelId,
        spaceId,
        position: pos,
    });

    this._dragChannelId = null;
    this._dropTarget = null;
}
```

**Visual feedback — CSS:**

```css
.channel-item[draggable="true"] { cursor: grab; }
.channel-item.dragging { opacity: 0.4; }
.drop-indicator {
    height: 2px;
    background: var(--pages-accent-9, #0ea5e9);
    margin: 0 var(--pages-space-2, 8px);
    border-radius: 1px;
}
.space-header.drop-target {
    background: var(--pages-accent-3, #e0f2fe);
    outline: 2px dashed var(--pages-accent-7, #818cf8);
    outline-offset: -2px;
}
```

A 2px blue drop indicator line renders between channel items at the computed insertion position. Space headers highlight with a dashed outline when they are valid drop targets.

#### 4d. Rendering changes

Update `_renderChannelItem` signature to accept context:

```typescript
private _renderChannelItem(channel: QhorusChannel,
                            spaceId: string | null, index: number): unknown
```

The `spaceId` and `index` parameters provide the drop-target context that `_onChannelDragOver` needs. Callers pass the appropriate values:
- `_renderSpaceGroup` passes `node.space.id` and the channel's index within the space
- The ungrouped loop passes `null` and the channel's index within ungrouped

Additional rendering changes:
- Add `draggable="true"`, `@dragstart`, `@dragend`, `@dragover`, `@drop` handlers
- Add `.dragging` class when `this._dragChannelId === channel.id`
- Render a `.drop-indicator` element before/after the channel item when `this._dropTarget` matches

**Ungrouped drop zone during drag:** The ungrouped section currently only renders when ungrouped channels exist (`tree.ungrouped.length > 0`). During a drag operation, render a minimal drop zone even when empty so users can drop a channel to remove it from a space:

```typescript
${!this._spaceFilter && (tree.ungrouped.length > 0 || this._dragChannelId) ? html`
    <ul class="ungrouped">
        ${tree.ungrouped.map((ch, i) => this._renderChannelItem(ch, null, i))}
        ${tree.ungrouped.length === 0 && this._dragChannelId ? html`
            <li class="drop-placeholder"
                @dragover=${(e: DragEvent) => this._onUngroupedAreaDragOver(e)}
                @drop=${this._onDrop}
                @dragleave=${this._onDragLeave}>
                Drop here to remove from space
            </li>
        ` : nothing}
    </ul>
` : nothing}
```

Drag handlers are on the `.drop-placeholder` `<li>` — not the parent `<ul>`. The placeholder only renders when ungrouped is empty, so there is no event bubbling conflict with channel item dragover handlers.

Add `_onUngroupedAreaDragOver` for the empty-area case (always position 0):

```typescript
private _onUngroupedAreaDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    this._dropTarget = { spaceId: null, position: 0 };
}
```

Add CSS for the placeholder:

```css
.drop-placeholder {
    padding: var(--pages-space-3, 12px);
    text-align: center;
    font-size: 12px;
    color: var(--pages-neutral-8, #888);
    border: 2px dashed var(--pages-neutral-5, #d4d4d4);
    border-radius: var(--pages-radius-1, 4px);
}
```

Update `_renderSpaceGroup` to add `@dragover`, `@drop`, `@dragleave` on `.space-header`:
- `@dragover=${(e) => this._onSpaceHeaderDragOver(e, node.space.id)}`
- `@drop=${this._onDrop}`
- `@dragleave=${this._onDragLeave}`

### Layer 5: chat-app — REST endpoint and unified event handling

Extend `MoveToSpaceRequest` to include `position`:

```java
public record MoveToSpaceRequest(String spaceId, Integer position) {}
```

Update `moveChannelToSpace` endpoint to pass position:

```java
var updated = spaceService.moveChannelToSpace(channelUuid, spaceUuid, request.position());
```

The endpoint remains `PUT /channels/{channelId}/space`.

**Unified event handling in `qhorus-workbench.ts`:** Both the context menu "Move to Space" and D&D drop emit `MOVE_CHANNEL_TO_SPACE`. The workbench handler must apply optimistic update and send `position` for both paths:

```typescript
if (topic === ChannelEventTopics.MOVE_CHANNEL_TO_SPACE) {
    const { channelId, spaceId, position } = payload as MoveChannelToSpacePayload;
    // Resolve space name from channelTree (covers empty and pending spaces)
    const spaceNode = this._channels.channelTree.spaces.find(s => s.space.id === spaceId);
    this._channels.applyMoveChannel(channelId, spaceId,
        spaceNode?.space.name ?? null, position);
    authenticatedFetch(`/api/chat/channels/${channelId}/space`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId, position }),
    }).catch(e => console.error('Move channel failed:', e));
}
```

The `MoveChannelToSpacePayload` type gains the optional `position` field (already defined in §4a).

## Data Flow

1. User drags channel item → `dragstart` stores channel ID
2. User drags over target area → `dragover` computes drop position, renders indicator
3. User drops → `drop` emits `MOVE_CHANNEL_TO_SPACE` with `{channelId, spaceId, position}`
4. App shell catches event → `PUT /channels/{channelId}/space` with `{spaceId, position}`
5. Backend `SpaceService.moveChannelToSpace(id, spaceId, position)` → reorders siblings, persists
6. `ChannelMoved` event fires → `onMutation` handler broadcasts `replace` ops for all channels in affected spaces via `broadcastChannelReplace`
7. Frontend receives `replace` push ops → `_applyChannels` updates channels (preserving client-side unreadCount) → `_toChannel` parses `displayOrder` → tree re-renders in new order

**Optimistic update:** The app shell calls `applyMoveChannel(channelId, spaceId, spaceName, position)` immediately before the REST call returns, so the UI reorders instantly. If the REST call fails, a full snapshot refresh corrects the state.

## Error Handling

- **Invalid drop target:** `dragover` only calls `preventDefault()` on valid targets (space headers, channel gaps). Dropping on invalid areas (e.g., the space filter dropdown) does nothing.
- **Self-drop (same position):** The backend detects no-op moves via early return — if `spaceId` is unchanged and the channel is already at the requested `position` in the sibling list, the method returns immediately without persistence or event firing (see `moveChannelToSpace` no-op detection in §Layer 2).
- **REST failure:** Optimistic update means the UI shows the new order immediately. On failure, the next push snapshot corrects the state. No explicit rollback needed.
- **Concurrent reorder:** Two users reordering simultaneously get last-write-wins semantics. `@Transactional` prevents data corruption, but both users see their own optimistic update until the next push replace corrects the losing client's state. This is acceptable for the platform's usage pattern.

## Testing Strategy

### blocks-ui (vitest + jsdom)

- Drag start sets `_dragChannelId` and configures `dataTransfer`
- Drag over computes correct position (top half = before, bottom half = after)
- **Same-space drag-down compensates index** — dragging B past C in [A, B, C] yields position 1 (not 2)
- Drop emits `MOVE_CHANNEL_TO_SPACE` with correct `channelId`, `spaceId`, and `position`
- Drop on space header emits with position omitted (append)
- Drop indicator renders at correct position during drag
- **Empty ungrouped drop zone** appears during drag when all channels are in spaces
- Dragged channel gets `.dragging` opacity class
- Self-space reorder emits same spaceId with new position
- Cross-space move emits target spaceId with position
- `channelTree` getter sorts by `displayOrder` (nulls last, then by name)
- **`_applyChannels` replace handler** — updates channel from replace row, preserves existing unreadCount

### chat-app (Java)

- `ChatResourceTest`: `PUT /channels/{id}/space` with `position` field
- `SpaceService` unit tests: reorder siblings, handle position=null (append), handle position=0 (prepend), handle out-of-bounds position

### qhorus

- `SpaceService` tests: `moveChannelToSpace` with position, gap reassignment
- **No-op detection**: same space + same position returns early, does not fire `ChannelMoved` event
- Migration test: `displayOrder` column exists and defaults to null
- `QhorusDatasetBuilder` test: channel columns include `displayOrder`
- **`channelToRow` helper**: produces 9-element row matching `CHANNEL_COLUMNS`, includes displayOrder

### qhorus push (broadcast pipeline)

- **`broadcastChannelReplace`**: sends `replace` op with `CHANNEL_COLUMNS` row including displayOrder
- **`ChannelMoved` → `onMutation`**: triggers replace broadcasts for all channels in both source and target spaces
- **`broadcastChannelsInSpace(null)`**: correctly broadcasts ungrouped channels via `ChannelQuery.topLevel()`
- **Cross-space move**: broadcasts to both source and target space channels
- **Same-space reorder**: broadcasts to target space only (source == target)

## Migration

Flyway migration in qhorus runtime:

```sql
ALTER TABLE channel ADD COLUMN display_order INTEGER;
```

Nullable, no default. Existing channels have `display_order = NULL` and sort by name (nulls-last behavior).

## References

- `channel-nav.ts` — blocks-ui channel navigation component (full read)
- `channel-state-controller.ts:66-74` — `applyMoveChannel` current implementation
- `channel-state-controller.ts:85-129` — `channelTree` getter
- `events.ts:25,111-114` — `MOVE_CHANNEL_TO_SPACE` event and payload
- `types.ts:75-87` — `QhorusChannel` interface
- `io.casehub.qhorus.api.channel.Channel` — Channel record (24 fields, jar)
- `io.casehub.qhorus.runtime.channel.SpaceService#moveChannelToSpace` — current implementation (jar)
- `ChatResource.java:178-190` — current REST endpoint
- `BroadcastingChannelManager.java` — channel mutation broadcasting decorator
- GE-20260826-ee71b5 — nested container DnD scoping with stopPropagation
- GE-20260809-6821a6 — Dockview tab reorder D&D gotcha (dragDidDrop flag)
- casehubio/chat-app#36 — context menu feature (parent issue)
