# Decisions — Issue #29: WsTriggerPool + JDBC EventStore

## D1: Latency profile

**Choice:** Real-time first — sub-100ms message delivery
**Alternatives:**
- Resilience first — 100-200ms debounce acceptable, prioritize no-lost-events
- Both equally — willing to pay complexity cost
**Rationale:** Chat workbench users expect instant message appearance
**Trade-offs:** Reconnection efficiency is secondary to delivery speed
**Exploration:** quick
**Status:** captured

## D2: Backend adoption scope

**Choice:** Full pages-push adoption — EventBroadcaster + TopicRegistry + JDBC EventStore
**Alternatives:**
- EventStore only — keep ChatWebSocketBroadcaster, add durability
- Incremental — JDBC EventStore now, full adoption as follow-up
**Rationale:** Maximum platform alignment, eliminate duplicated infrastructure
**Trade-offs:** Larger change, more files touched, but removes technical debt
**Exploration:** quick
**Status:** captured

## D3: Push client ownership

**Choice:** Build PushClient in pages-data as a platform capability
**Alternatives:**
- Separate pages issue — #29 blocked until it ships
- Stub in chat-app, upstream later — ships fast but creates tech debt
**Rationale:** Platform should own both sides of its protocol. Include in this slot (pages added as repo).
**Trade-offs:** Wider scope across repos, but coherent single change
**Exploration:** quick
**Status:** captured

## D4: PushClient architecture

**Choice:** Standalone reactive controller (Approach A)
**Alternatives:**
- PushSource as DataSource in pages-data pipeline — fits pipeline pattern but heavier abstraction, tighter coupling
**Rationale:** Chat-app already has ChatDemoAdapter for dataset op parsing. PushClient replaces only the transport layer (ConnectionController). Simpler, more reusable, one consumer right now.
**Trade-offs:** Doesn't integrate with DataSink pipeline (can be added later as pushSource wrapping PushClient)
**Exploration:** quick
**Depends on:** D2, D3
**Status:** captured

## D5: Topic model

**Choice:** One topic per dataset — chat:channels, chat:messages, chat:topics, chat:members, chat:presence, chat:reactions, chat:commitments
**Alternatives:**
- Hierarchical by channel (chat:ch-1:messages) — finer-grained but requires rearchitecting frontend data loading from eager to lazy per-channel
- Single topic (chat:events) — simplest but replay is all-or-nothing, doesn't scale
**Rationale:** Independent seq counters per dataset mean reconnection replays only what changed. Matches current broadcaster's 7-dataset structure. Presence (frequent) doesn't force message replay (large).
**Trade-offs:** 7 subscriptions per client (trivial overhead)
**Exploration:** quick
**Depends on:** D2
**Status:** captured
