---
layout: post
title: "Six Small Things That Aren't Small"
date: 2026-08-09
entry_type: note
subtype: diary
projects: [casehub-chat-app]
tags: [accessibility, lit, commitment-viz, chat-ui]
---

The branch was called `issue-25-commitment-transition-badges` but it covered six issues beyond that — a batch of S and XS enhancements for the chat workbench. The kind of work that looks like cleanup in the commit log but reshapes how the UI actually feels.

Two findings stood out.

## Deriving transitions from what you already have

The correlation panel shows a chain of messages tied to a commitment — command sent, acknowledged, fulfilled. The original issue asked for transition badges showing state changes between nodes: OPEN → ACKNOWLEDGED at message N, ACKNOWLEDGED → FULFILLED at message M. The assumed solution was a backend state-history endpoint or a `previousState` field on WebSocket events.

Neither exists. But `CommitmentRecord` already carries `createdAt`, `acknowledgedAt`, and `resolvedAt` timestamps. Three timestamps, three states, two transitions. The derivation is four lines:

```typescript
if (record.acknowledgedAt) {
  transitions.push({ from: 'OPEN', to: 'ACKNOWLEDGED', timestamp: record.acknowledgedAt });
}
if (record.resolvedAt && record.state !== 'OPEN' && record.state !== 'ACKNOWLEDGED') {
  const prev = record.acknowledgedAt ? 'ACKNOWLEDGED' : 'OPEN';
  transitions.push({ from: prev, to: record.state, timestamp: record.resolvedAt });
}
```

The matching logic — which connector in the chain does a transition belong to — needed a subtle boundary fix. A transition at exactly timestamp T matches the connector that *ends* at T, not the one that starts at T. Off-by-one in time, not in array indices.

When a proper state-history endpoint lands, the derivation gets replaced with a direct mapping. The connector matching stays the same.

## willUpdate is not updated

I added a scroll-to-new-messages pill to the channel feed — the floating "↓ 3 new messages" badge that appears when you're scrolled up and new messages arrive. The unread count accumulation seemed natural inside Lit's `updated()` lifecycle hook, right next to the auto-scroll logic that was already there.

Claude flagged the test failures: `await el.updateComplete` resolved before the pill appeared in the DOM. Setting a `@state()` property inside `updated()` schedules a *second* render cycle. The first `updateComplete` promise resolves after the first cycle — before the second render runs. The test sees stale DOM.

The fix: move derived state computation to `willUpdate()`, which runs *before* `render()` in the same cycle. The unread count is visible in the first render. No second cycle, no race with `updateComplete`.

Lit's dev-mode warning — "Element scheduled an update after an update completed" — appeared in the console but didn't explain the testing consequence. The distinction between "I need the changed-property map" (available in both hooks) and "I need the updated DOM" (only in `updated()`) is the decision point. Pure state derivation belongs in `willUpdate()`.

## The rest

Replacing `window.confirm()` and `window.prompt()` with `<blocks-confirm-dialog>` in the channel nav was more interesting than expected. The synchronous browser modals were blocking — click delete, dialog appears, code waits for the answer. The component-based replacement is async: click delete, set `_deleteTarget` state, dialog renders, listen for `confirm`/`cancel` events. Two dialog instances live permanently in the template, toggled by state. The test pattern shifts from mocking `window.confirm` to dispatching synthetic `confirm` events on the dialog element.

The channel feed picked up four accessibility mixins from `pages-primitives/a11y` — `LiveRegionMixin`, `KeyboardShortcutMixin`, `RovingTabindexMixin`, `FocusTrapMixin`. Every sibling component already used them. The vitest alias needed `dist/` instead of `src/` for the transitive dependency because Vite's oxc transform walks up looking for `tsconfig.json` from the alias target — a gotcha that doesn't exist with the older esbuild transform.

The range highlighting for commitment spans came together as a `messageHighlights` property on channel-feed: a plain `Record<string, string>` mapping message IDs to CSS background values. The workbench resolves commitment categories to colours and passes them in. The feed component stays generic — it doesn't know about commitments, just backgrounds.

Six issues, none of them architectural. But the feed now announces messages to screen readers, navigates with arrow keys, shows unread counts when you scroll away, highlights commitment ranges across message spans, and doesn't pop browser-native modals. The correlation panel tells you how a commitment's state evolved. The phone layout has proper aria-labels and traps focus when a drawer is open.

Small things that aren't small if you're using them.
