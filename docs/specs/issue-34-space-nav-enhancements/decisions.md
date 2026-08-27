# Decisions — issue-34-space-nav-enhancements

## D0: Frontend space representation — channel-derived with local overlay

**Choice:** Spaces remain derived from channel metadata on the frontend (`channelTree` computes `SpaceNode` from `ch.spaceId`/`ch.spaceName`). For CRUD operations that create or modify spaces before the next push snapshot, the controller maintains a local `pendingSpaces: Space[]` overlay that the `channelTree` getter merges with channel-derived data. The push snapshot overwrites the overlay on each cycle.
**Alternatives:**
- First-class space entity with its own push dataset — a separate `spaces` push topic would give the frontend independent space visibility. Requires qhorus push module changes (new topic, new dataset builder) and is the full solution for issue #35.
- REST supplementary calls — frontend calls `GET /api/spaces` alongside push data. Adds a second data source with synchronization complexity.
**Rationale:** The existing channel-derived approach works for all operations except "create empty space" (which has no channels to derive from). A local overlay handles this minimal gap without push module changes. Issue #35 addresses the full empty-space-visibility story. The overlay is temporary — the next snapshot replaces all data.
**Trade-offs:** Empty spaces created by the user are visible only until the next snapshot cycle (which will remove them since they have no channels). This is acceptable for #34 because the "Create Channel Here" context menu action (D2) lets the user immediately add a channel, making the space persistent. Full visibility rules are #35's scope.
**Sources:** `ChannelStateController.channelTree` getter (lines 45-83), `QhorusDatasetBuilder.buildChannelSnapshot()`, issue #35
**Exploration:** quick (surfaced by decision review R1-03, R1-08)
**Status:** captured

## D1: Space creation entry point — header action

**Choice:** A dedicated "+ Create Space" button at the top of the nav, on the same row as the space filter dropdown (icon button to the right of the filter). Spaces are the top-level organizer, so their creation entry point is prominent and separate from channel creation.
**Alternatives:**
- Bottom alongside channel create — simpler but conflates two levels of hierarchy
- Context menu only — discoverable for power users but hidden for newcomers
**Rationale:** Spaces are the primary grouping mechanism. Placing create at the top signals their importance and separates the action from per-channel operations at the bottom.
**Trade-offs:** Uses horizontal space next to the filter; acceptable given the nav's width.
**Sources:** `channel-nav.ts` (existing Create Channel button at bottom), issue #34 requirements
**Exploration:** quick
**Status:** captured

## D2: CRUD access for existing items — context menu

**Choice:** Right-click context menus on space headers and channel items. Space header menu: Rename, Delete, Create Channel Here. Channel item menu: Move to Space (with submenu listing available spaces). Channel rename is not in #34 scope — deferred.
**Alternatives:**
- Inline hover actions — more discoverable but adds visual noise; channel items already show a delete button on hover
- Overflow menu (three-dot) — touch-friendly but adds persistent UI elements to every item
**Rationale:** Context menus are the standard desktop pattern for per-item operations. They keep the default UI clean while making operations discoverable on right-click. The existing hover delete button on channels stays for quick access.
**Trade-offs:** Less discoverable on touch devices; acceptable for a demo app.
**Sources:** `_renderSpaceGroup()` and `_renderChannelItem()` in `channel-nav.ts`
**Exploration:** quick
**Status:** captured

## D3: Move-to-space target picker — submenu

**Choice:** Right-click channel → "Move to Space ▸" → submenu lists available spaces plus "No Space" (for unassigning). Self-contained, no extra dialog.
**Alternatives:**
- Modal picker dialog — better for many spaces (search/filter) but heavier interaction for demo scale
- Drag and drop — most intuitive but complex and overlaps with issue #36 scope
**Rationale:** Demo scale means a small number of spaces. A submenu is the lightest interaction pattern that keeps the user in context. Drag-and-drop is explicitly deferred to #36.
**Trade-offs:** Does not scale well to many spaces; acceptable at demo scale.
**Depends on:** D2 (context menu is the container)
**Sources:** `SpaceService.moveChannelToSpace()` (qhorus-runtime), issue #36 scope boundary
**Exploration:** quick
**Status:** captured

## D4: API wiring — event pattern

**Choice:** Nav emits custom events: CREATE_SPACE, RENAME_SPACE, DELETE_SPACE, MOVE_CHANNEL_TO_SPACE. "Create Channel in Space" reuses the existing CREATE_CHANNEL event with `spaceId` set (no new event needed — `CreateChannelPayload` already has `spaceId`). Workbench intercepts space events directly in `_onChatEvent` (not via controllers) and calls SpaceResource REST API via `authenticatedFetch`, then applies optimistic updates (D5). Nav stays API-agnostic.

**Pattern divergence acknowledged:** Existing channel events flow through `ChannelStateController.handleEvent()`. New space events are handled directly in the workbench because they require REST API calls + optimistic state mutation — a different pattern from the passive event forwarding the controller does. The workbench also needs to wire the existing `CREATE_CHANNEL` and `DELETE_CHANNEL` events to REST API calls, which are currently unhandled.

**Cross-repo requirement:** `SpaceService.moveChannelToSpace()` has no REST endpoint. Add `PUT /api/channels/{id}/space` with body `{ spaceId: UUID | null }` to `ChannelResource` in qhorus. This is a channel property mutation, so ChannelResource is the natural home.
**Alternatives:**
- Direct API calls in nav — simpler wiring but breaks the component's API-agnostic design; nav would need API base URL and auth context
**Rationale:** Consistent with the intended CREATE_CHANNEL / DELETE_CHANNEL pattern (even though those aren't wired yet). The workbench already has `authenticatedFetch` and identity state.
**Trade-offs:** Workbench event handler code grows; manageable.
**Depends on:** D2 (context menu triggers these events), D0 (optimistic updates depend on local overlay)
**Sources:** `ChannelEventTopics` in `events.ts`, `CreateChannelPayload.spaceId`, `_onChatEvent` in `qhorus-workbench.ts`, `SpaceResource` REST API, `ChannelResource`
**Exploration:** quick
**Status:** revised (R1-04 missing REST endpoint, R1-05 redundant event, R1-07 missing dependency)

## D5: State refresh — optimistic update + snapshot reconcile

**Choice:** After a successful REST API call (triggered by the workbench handling a space event), apply the change locally in the `ChannelStateController`:

- **Create space:** Add to `pendingSpaces` overlay (D0). Space appears immediately in tree.
- **Rename space:** Update `spaceName` on all channels whose `spaceId` matches. The `channelTree` getter recomputes automatically.
- **Delete space (after channels moved):** Remove channels' `spaceId`/`spaceName`/`parentSpaceId` (they move to ungrouped). Remove from `pendingSpaces` if present.
- **Move channel:** Update the channel's `spaceId`/`spaceName`/`parentSpaceId`.

The next push snapshot replaces `this.channels` entirely, reconciling any drift. If the API call fails, revert the optimistic change.
**Alternatives:**
- Wait for push snapshot — simpler but introduces visible delay between action and UI update
- Manual refresh — guaranteed correct but heavier network cost and visible flicker
**Rationale:** Instant feedback is essential for CRUD operations. The push snapshot already runs on a regular cycle and will correct any drift.
**Trade-offs:** Temporary inconsistency window between local state and server state; corrected on next snapshot. Rename optimistic update touches N channels.
**Depends on:** D4 (events trigger the API calls), D0 (pendingSpaces overlay for create)
**Sources:** `ChannelStateController.channelTree` getter, `_applyChannels` snapshot handler
**Exploration:** quick
**Status:** revised (R1-03 space creation impossibility, R1-07 missing dependency)

## D6: Delete space policy — client-side orchestration with confirmation

**Choice:** Deleting a space is a multi-step client operation:
1. Show confirmation dialog: "Deleting space 'X' will move N channels to the top level. Continue?"
2. On confirm: move all channels in the space to root (call `PUT /api/channels/{id}/space` with `{ spaceId: null }` for each channel)
3. Then call `DELETE /api/spaces/{id}`
4. If any step fails, stop and show error (channels already moved stay moved — eventual consistency is acceptable)

This matches `SpaceService.delete()` which blocks if channels exist. The workbench orchestrates the multi-step flow.
**Alternatives:**
- Block deletion until user manually moves channels — matches backend exactly but worse UX
- Add cascade-move mode to SpaceService.delete() — contradicts approved #7 design spec
- Cascade delete channels — too destructive
**Rationale:** Non-destructive, matches the backend's strict guard design while providing a smooth UX. The confirmation dialog explains the side effect. Client-side orchestration is acceptable at demo scale (small channel counts per space).
**Trade-offs:** Multi-step operation can partially fail. At demo scale with few channels per space, the risk is low. The next snapshot corrects state.
**Depends on:** D4 (events and REST wiring), D5 (optimistic update after success)
**Sources:** `SpaceService.delete()` (lines 87-99), `hasChannelsInSpace()`, `moveChannelToSpace(channelId, null)`, decision review R1-02
**Exploration:** quick
**Status:** revised (R1-02 backend contradiction, R1-10 missing confirmation)

## D7: Create Channel in Space — reuse existing CREATE_CHANNEL event

**Choice:** Space header context menu includes "Create Channel Here". It emits the existing `CREATE_CHANNEL` event with `spaceId` set in the payload. The existing `CreateChannelPayload` already has `spaceId?: string`. No new event type needed. The workbench handler passes `spaceId` through to the `POST /api/channels` REST body.
**Alternatives:**
- New CREATE_CHANNEL_IN_SPACE event — creates redundant event type for the same operation
**Rationale:** `CreateChannelPayload` and `ChannelResource.CreateChannelRequest` both already support `spaceId`. Reusing the existing event avoids ambiguity about which event to use.
**Trade-offs:** None — this is strictly simpler than the alternative.
**Depends on:** D2 (context menu is the container), D4 (workbench wires CREATE_CHANNEL to REST)
**Sources:** `CreateChannelPayload.spaceId` (events.ts:73), `ChannelResource.CreateChannelRequest.spaceId` (line 572), decision review R1-05
**Exploration:** quick
**Status:** revised (R1-05 redundant event)

## D8: Space rename UX — inline edit

**Choice:** Right-click → "Rename" makes the space name editable in-place (input field replacing the text span). Enter to confirm, Escape to cancel. Standard tree-rename UX like file explorers. A `_renamingSpaceId` state flag gates the space header click handler (prevents expand/collapse toggle during rename).
**Alternatives:**
- Dialog — more consistent with existing Create Channel dialog but heavier for a single-field edit
**Rationale:** Inline editing is the standard pattern for renaming items in tree views. It's faster and more natural than opening a dialog for a single text field.
**Trade-offs:** Two interaction modes on the space header (click-to-toggle vs inline-edit) must be carefully managed via state flag.
**Depends on:** D2 (context menu triggers rename mode)
**Sources:** `_renderSpaceGroup()` space header markup in `channel-nav.ts`, decision review R1-12
**Exploration:** quick
**Status:** revised (R1-12 click handler conflict)

## D9: Context menu implementation — built into ChannelNavElement

**Choice:** Build the context menu directly inside the nav component as a positioned `<div>`. Internal state (`_contextMenu: { x, y, type, target }`) drives conditional rendering, same pattern as existing create/delete dialogs.
**Alternatives:**
- Generic `pages-context-menu` in pages-ui-components — reusable primitive, but pre-release stage favors building inline first and extracting when a second consumer appears (per blocks-ui promotion pipeline)
- Workbench-owned context menu — nav stays dumb but workbench needs intimate DOM knowledge, breaks encapsulation
**Rationale:** Menu content is determined by internal tree structure (space vs channel, which spaces exist for move targets). Building inline first matches the blocks-ui promotion pipeline: components are born in domain repos, mature, then promoted to blocks-ui when a second consumer needs them. If the context menu proves valuable, extraction to pages-ui-components is straightforward.
**Trade-offs:** Makes ChannelNavElement larger. Extraction cost later is real but bounded — the positioning/dismiss logic is separable from the menu items.
**Depends on:** D2 (context menu is the feature this implements)
**Sources:** `_renderTree()`, `_renderSpaceGroup()`, `_renderChannelItem()` in `channel-nav.ts`, decision review R1-09
**Exploration:** quick
**Status:** revised (R1-09 YAGNI level)
