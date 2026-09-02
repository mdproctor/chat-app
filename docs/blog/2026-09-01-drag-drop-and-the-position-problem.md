---
title: Drag-and-drop and the position problem
date: 2026-09-01
tags: [chat-app, blocks-ui, qhorus, drag-and-drop, channel-reordering]
entry_type: note
subtype: diary
issue: 39
status: draft
---

# Drag-and-drop and the position problem

The context menu for moving channels between spaces shipped with #36. Functional, complete, accessible. But it felt like filling out a form — right-click, hover over "Move to Space", pick a target. Drag-and-drop is the obvious next step: grab the channel, drop it where you want it.

What looked like a one-component UX enhancement turned into a three-repo change. The reason: position.

## Move vs. reorder

The context menu does a move. Channel goes from Space A to Space B. That's a single field update — `channel.spaceId = targetSpace`. No ordering involved.

Drag-and-drop wants more. When you drop a channel between two other channels, you expect it to land *there* — not appended to the end. That means the data model needs to know about ordering, which it didn't.

The Channel record gained an `Integer displayOrder` field. Nullable — channels without an explicit order sort after ordered channels, then by name. One field, but it ripples: the record (25th parameter now), the JPA entity, the Flyway migration, the push column layout (displayOrder at index 8, unreadCount shifts to 9), the snapshot builder, the broadcaster.

## The positional drop

`SpaceService.moveChannelToSpace` grew a third parameter: `Integer position`. Same-space moves at the same position are no-ops. Cross-space moves renumber both the source and target space's siblings. The frontend mirrors this in `applyMoveChannel` for optimistic updates — the UI reorders instantly, and if the REST call fails, the next push snapshot corrects it.

The tricky part was the off-by-one. When you drag channel B downward past channel C in the same space [A, B, C], the visual index says "position 2" but the backend — which removes B first, then inserts — needs "position 1". The `_getDragSourceIndex` helper detects same-space drags and compensates.

## The push gap

The original codebase had no mechanism to broadcast channel *updates*. `broadcastChannelAppend` and `broadcastChannelRemove` existed, but no `broadcastChannelReplace`. Moving a channel between spaces was a silent operation — the context menu sent a REST call, the backend updated the database, and... nothing. The UI wouldn't reflect the change until the next full snapshot.

A new `ChannelMoved` event on the `ChannelMutationEvent` sealed interface, observed by the broadcaster, now sends `replace` ops for every channel in both the source and target space. The frontend's `_applyChannels` handler gained `replace` support to match.

## The #38 investigation

Issue #38 reported that `mvn install` in a slot clone destroyed sibling directories. The hypothesis was a Maven clean plugin with `filesets` referencing `..` paths. Investigation found no such configuration in any POM in the build chain. The default clean plugin only deletes `target/`. The actual destruction mechanism remains unclear — possibly a transient Yarn Berry workspace integrity issue. The parent issue was closed; the soredium durability fix (push after every commit in slots) stands on its own merits.

## Topic and reaction tests (#18)

The last issue in the queue was pure test coverage — verifying that topics and reactions flow correctly from the push layer through the workbench to the UI components. Ten tests across two areas:

**Topics:** topic bar visibility based on count, message filtering by selected topic, `SELECT_TOPIC` and `VIEW_MODE` event routing, viewMode propagation to both the feed and topic bar, topic data passed to the feed for grouping (including resolved-state visibility), and MERGED topic exclusion from the topic list.

**Reactions:** multiple reactions on the same message (same emoji from different actors), push `append` ops updating reactions live, and multiple distinct emojis rendering as separate entries.

The tests follow the workbench's existing pattern — inject push data via `_push.applyOp`, set controller state, then assert component properties. They're structurally correct but currently blocked by a pre-existing broken import in blocks-ui-core (`status-badge` deleted but still referenced in `commitment-state-pill.ts`). The import breaks vitest module resolution for the entire workbench test file.

## Work-end: two soredium bugs

The branch close process surfaced two bugs in the work-end tooling.

The first: `_preflight_two_hop` in `land_flow.py` runs `git status --porcelain` on the original repo before landing, and treats *any* output as a dirty worktree. That includes untracked files — in this case, a dozen screenshot PNGs left over from a previous session in the blocks-ui repo. Untracked files don't interfere with merge or rebase. The fix was one line: filter `??` lines before checking. Filed as soredium#319, fixed same day.

The second: the landing step merges feature branch content into the original repo's local `main` but doesn't always push to `origin`. The archive verification step then fetches `origin/main` and checks ancestry — which fails because the commits haven't been pushed. The verification should check local `main`, not `origin/main`. Push to GitHub is the upstream PR step's concern, not the archive verifier's. Filed as soredium#322.

## What shipped

- **qhorus**: `displayOrder` on Channel, positional `moveChannelToSpace`, `ChannelMoved` event, push broadcast infrastructure
- **blocks-ui**: HTML5 drag-and-drop in `channel-nav.ts` with positional drops, drop indicators, space header highlighting, empty ungrouped drop zone
- **chat-app**: REST endpoint with position, workbench optimistic update, 10 integration tests for topic sidebar and reaction rendering (#18)
- **soredium**: two work-end bugs found and reported (#319 fixed, #322 filed)

<!-- TODO: add screenshots of D&D feature — needs working frontend dev environment (Vite source-tree resolution currently broken) -->
