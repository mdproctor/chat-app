# Decisions — issue-7-space-channel-hierarchy

## D1: Space data transport — inline channel columns

**Choice:** Extend the channel snapshot with inline space columns at positions 5–7 (spaceId, spaceName, parentSpaceId). These positions are already parsed by `ChannelStateController._toChannel()`. Add unreadCount at position 8 — requires extending the controller's parser.
**Alternatives:**
- Separate `chat:spaces` push topic — cleaner separation but adds timing/ordering complexity between two datasets
**Rationale:** The `ChannelStateController._toChannel()` already parses positions 5–7 for space data. Denormalised approach avoids join timing between two datasets. Space metadata changes (rename, move) are rare — duplicating name across rows is negligible cost.
**Trade-offs:** Space renames require updating all channel rows in the snapshot. Acceptable at demo scale. `ChatDatasetBuilder` needs `SpaceStore` injection and must use `findByIds()` for batch space name resolution (avoid N+1 queries per channel).
**Sources:** `ChannelStateController._toChannel()` (blocks-ui JAR), `ChatDatasetBuilder.buildChannelSnapshot()` (chat-app), `SpaceStore.findByIds()` (qhorus API)
**Exploration:** quick
**Status:** revised

## D2: Collapsible space groups — component-local state

**Choice:** Expand/collapse state managed as a `Set<string>` (expanded space IDs) inside `ChannelNavElement`. All groups expanded by default. Keyboard navigation reworked for tree traversal (group headers focusable, Enter/Space to toggle, collapsed sections skipped during ArrowUp/ArrowDown).
**Alternatives:**
- LayoutStore persistence — its `LayoutState` type (splits/docks/panels shape) doesn't fit expand/collapse (`Set<string>`). If persistence is wanted later, `localStorage` directly in the component is the right mechanism.
- URL hash state — enables deep-linking but overkill for demo-scale space list
**Rationale:** Demo app, small space list, transient UI preference. Simplest approach that can be externalized later if needed.
**Trade-offs:** State resets on page refresh. Keyboard navigation model changes from flat index to tree traversal — spec must address accessibility.
**Sources:** `LayoutStore` pattern in `qhorus-workbench.ts`, `ChannelNavElement._focusedIndex` keyboard handling (channel-nav.ts:260-276)
**Exploration:** quick
**Status:** revised

## D3: Scope boundaries — spaces are display grouping only

**Choice:** Spaces are a display grouping mechanism in the nav, not independently navigable entities. No space-level CRUD operations in the nav (create/rename/delete space, move channel between spaces). Spaces exist in the nav only when they contain channels visible to the current user — empty spaces are invisible.
**Alternatives:**
- Full space management in nav — create/rename/delete space, drag channels between spaces. Requires space CRUD UI, context menus, drag-and-drop. Out of proportion for Phase 4.
- Separate space topic so empty spaces are visible — needed if "create channel in space" workflows are added later. A future issue.
**Rationale:** This is a Phase 4 demo feature. The normative triples pattern is speculative and not stress-tested. The nav should demonstrate the grouping concept; space management belongs to a later phase once the grouping pattern is validated.
**Trade-offs:** Cannot discover or create channels in empty spaces. Acceptable — the demo seeds its own spaces with channels.
**Depends on:** D1 (inline transport means spaces only visible through their channels)
**Sources:** `ChannelStateController.channelTree` getter (derives spaces from channel data), `SpaceStore.listRoots()` (alternative for independent space visibility)
**Exploration:** quick
**Status:** captured
