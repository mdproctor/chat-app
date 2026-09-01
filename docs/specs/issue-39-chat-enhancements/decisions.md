# Decisions — #39 drag-and-drop channel reordering

## D1: Ordering field placement

**Choice:** Add `displayOrder` integer field to the `Channel` record in qhorus-api
**Alternatives:**
- Separate `ChannelOrdering` entity/table — decouples ordering from Channel but adds a new entity, store, and queries for a single integer
- Replace `spaceId` with `SpaceChannelAssignment` many-to-many — clean relational model but major refactor across Channel, SpaceService, ChannelStore, and all queries
**Rationale:** Simplest change. One integer field on the existing record, consistent with `spaceId` already being on Channel. `moveChannelToSpace` becomes `moveChannelToSpace(channelId, spaceId, displayOrder)`.
**Trade-offs:** Grows the already-large Channel record (24 → 25 fields). Ordering is tightly coupled to Channel rather than being a separate concern.
**Sources:** `io.casehub.qhorus.api.channel.Channel` record (jar), `SpaceService.moveChannelToSpace()` (jar)
**Exploration:** quick
**Status:** captured

## D2: DnD API approach

**Choice:** HTML5 Drag and Drop API (`draggable`, `dragstart`/`dragover`/`drop`)
**Alternatives:**
- Pointer Events API — full manual control, better touch support, but significantly more code (hit testing, ghost management, scroll handling)
- HTML5 D&D + touch fallback — best UX coverage but two code paths to maintain
**Rationale:** This is a desktop chat workbench — mobile/touch is not a target. HTML5 D&D provides native ghost images, native cursor feedback, and is the simplest approach. The existing context menu serves as the accessible fallback for keyboard users.
**Trade-offs:** No touch/mobile support. Limited drag preview customization.
**Sources:** `channel-nav.ts:530-547` (channel item render), `channel-nav.ts:549-576` (space group render), GE-20260826-ee71b5 (nested container DnD scoping pattern)
**Exploration:** quick
**Status:** captured

## D3: Event model for reordering

**Choice:** Extend `MOVE_CHANNEL_TO_SPACE` event with optional `position` field
**Alternatives:**
- New `REORDER_CHANNEL` event — clearer separation but two events for what is conceptually one operation
**Rationale:** Moving a channel to a space at a position and reordering within a space are the same operation. The API is `moveChannelToSpace(channelId, spaceId, position)`. When `spaceId` is the same as the current space, it's a reorder. When different, it's a move. Omitting `position` means "append to end" (backward compatible with existing context menu code).
**Trade-offs:** Overloads one event with two concerns — but they are genuinely one concern (place this channel at this position in this space).
**Sources:** `events.ts:25` (`MOVE_CHANNEL_TO_SPACE`), `events.ts:111-114` (`MoveChannelToSpacePayload`)
**Exploration:** quick
**Status:** captured
