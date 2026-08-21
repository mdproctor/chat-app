---
entry_type: note
subtype: diary
title: "The Composition Trap"
date: 2026-08-19
author: mdp
tags: [architecture, frontend, component-reuse, claudony, chat-app]
status: draft
---

# The Composition Trap

I came into this session to triage chat-app's open issues and check whether upstream changes in pages and blocks-ui needed incorporating. Routine housekeeping. What I found instead was a structural problem hiding in plain sight.

Claude investigated both repos in parallel — pages had shipped WsTriggerPool (shared WebSocket connection pooling), dock-workbench (IntelliJ-style zone layout), presence indicators, durable event stores, and server-side pagination. blocks-ui had landed #119: a11y mixins, scroll-to-new pill, message highlighting, three new panel components (task, correlation, artifact), and full topic support. A lot of upstream capability that chat-app wasn't consuming.

We filed four new issues, created a slot, and burned through a batch of six — consuming all of it. That part was mechanical. The interesting part came after.

## Two Workbenches, One Problem

I'd been vaguely aware that claudony had its own channel UI, but I hadn't looked closely at the overlap. When I asked Claude to compare the two frontends, the answer was uncomfortable: both apps are 873 lines of Lit composition code, both consume the exact same blocks-ui-channel-activity components, and both wire them to qhorus through their own REST layers.

The divergences are real but shallow — UUID vs string-name channel addressing, WebSocket vs SSE push, responsive dock layout vs fixed terminal-centric layout. Four abstraction points, not four architectures. Everything else — feed, nav, input, reactions, threading, topics, member panel, task/correlation/artifact panels — is identical.

The dual maintenance cost is the real problem. Every upstream enhancement gets wired once in whichever app gets attention, and the other goes stale. That's what prompted this session in the first place — chat-app hadn't consumed the latest blocks-ui changes. But the same thing happens in reverse: chat-app gets new features, claudony doesn't pick them up. No mechanism exists to keep them in sync because nobody realised they were duplicates.

## Why It Looked Intentional

claudony's `MeshResource` wraps qhorus through a `QhorusDashboardService` that provides name-based channel addressing and aggregated overview queries (channel list with counts, cross-channel feed). This looks like a deliberately different API layer. But when I read the actual service, individual channel operations — post message, add reaction, list members, fetch topics — just resolve the name to a UUID and call the same qhorus-api consumer interfaces that chat-app uses directly.

The dashboard service exists for two things: name→UUID resolution (a one-method fix) and aggregation queries (genuinely dashboard-specific). Everything else is accidental coupling — individual operations bundled alongside aggregation because they needed the same name resolution.

## The Fix

chat-app becomes both a standalone product and a reusable library. The composition layer — data fetching, push subscriptions, cursor management, panel mounting — gets extracted with strategy injection for the parts that genuinely differ: layout, context headers, backend endpoint shape. claudony consumes chat-app's composition layer and plugs in its own layout (terminal-centric) and context (case headers, worker switching, lineage).

The channel addressing unifies with a resolver at the REST boundary: `try UUID.fromString(), catch → channelService.findByName()`. One method, and both consumers work against the same API.

The dashboard aggregation (channel listing with counts, cross-channel feed) moves into chat-app's API layer too — `QhorusDashboardService` already lives in qhorus-runtime, which chat-app depends on. Binding data comes along for the ride; the standalone UI ignores what it doesn't need. Simpler than maintaining two code paths.

## What This Changes

The issue board went from twelve open issues to four. Three closed because the upstream blockers resolved. Two closed because #33 (the consolidation) supersedes them — #9 (embed workbench in claudony) and #11 (pages-data-request self-wiring) were both solving the wrong problem. The right problem was never "how does claudony embed chat-app's workbench" — it was "why are there two workbenches."

The remaining four issues (#7 space hierarchy, #18 integration tests, #32 floating panels, #2 touch interactions) are all pure chat-app features that, once #33 lands, claudony gets for free. That's the structural fix: build once, consume twice. Not "keep both current through discipline" — discipline doesn't survive asymmetric attention.
