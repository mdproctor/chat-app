# Decisions — Issue #33: Consolidate Channel UI and Services

## D1: Frontend composition pattern

**Choice:** Reactive controllers — composable Lit reactive controllers in blocks-ui
**Alternatives:**
- Composition element (`<channel-workspace>`) — wraps all blocks-ui components with slot-based layout; controllers offer per-feature opt-in that slots can't match (host can use channel state without importing reaction or commitment logic)
- State store + adapters — framework-agnostic store; doesn't integrate naturally with Lit's reactive cycle, more boilerplate for same result
**Rationale:** Lit-native pattern for reusable stateful logic. Controllers own data lifecycle, hosts own layout and rendering. Composable by design — each host mixes in only the controllers it needs. Drops workbench elements from ~800 lines to ~200 (layout + binding).
**Trade-offs:** Controllers can't render — host still wires state to components. But this is the right separation: data logic is shared, layout is app-specific.
**Exploration:** quick
**Status:** captured

## D2: Controller decomposition

**Choice:** Composable controllers — split into focused responsibilities: ChannelStateController (channels, spaces, filtered views, tree construction), PushController (WebSocket connection lifecycle, dataset op parsing), MessagingController (send message, reply, event routing), MembershipController (members, presence), ReactionController (reaction state), CommitmentController (commitment tracking). Each host mixes in only what it needs.
**Alternatives:**
- Single thick ChannelController — simpler to use (one import) but becomes a ~400-line god object with six responsibilities, changes for any reason, hard to test
- Thicker controller that also renders — crosses into layout territory
**Rationale:** Lit reactive controllers are designed to be small and composable. A host that only needs channel nav and messaging doesn't import reaction or commitment logic. More testable — each controller has a narrow state surface. Aligns with blocks-ui principle of "reusable in parts."
**Trade-offs:** More controllers to compose in each host. But composition is explicit — you see exactly what capabilities the host uses.
**Exploration:** quick (revised after decision review R1-05)
**Depends on:** D1
**Status:** revised

## D3: Backend unification approach

**Choice:** Promote channel aggregation to qhorus — aggregation endpoints (channels with counts, cross-channel feed, name resolution, batch reactions) go on qhorus's existing ChannelResource. Space CRUD gets a new SpaceResource in qhorus-runtime. Both auto-mount via JAX-RS classpath scanning. ChatResource stays focused on chat-app-specific operations (posting with artefact refs, commitment-aware workflows). Claudony's MeshResource shrinks to instances-only.
**Alternatives:**
- Extend ChatResource with aggregation — puts platform-level channel queries in an application, every future app needs to depend on chat-app
- New ChannelAggregationResource in chat-app — same problem, wrong layer
- Extract ChatChannelService — indirection without benefit
**Rationale:** Channel aggregation and space management are qhorus-domain concerns. QhorusDashboardService already exists in qhorus-runtime. SpaceStore/SpaceService already exist. Thin REST resources over them (~50-80 lines each) give every qhorus consumer these capabilities for free.
**Trade-offs:** Requires qhorus changes (adds qhorus as a repo to this slot). But the code already lives there — just needs REST exposure.
**Exploration:** quick (revised after decision review R1-02, R1-04, R1-07)
**Status:** revised

## D4: Claudony push migration approach

**Choice:** Promote push wiring to a qhorus-push module — ChatDatasetBuilder, ChatWebSocketBroadcaster, ChatPushWebSocket, PushInfrastructure move to a new qhorus-push module in the qhorus repo. Both chat-app and claudony depend on qhorus-push (foundation). Neither depends on the other. ClaudonyChannelBackend switches from ChannelEventBus ticks to EventBroadcaster. ChannelEventBus and SSE endpoints deleted.
**Alternatives:**
- Claudony depends on chat-app Maven artifact — violates tier hierarchy (integration app depending on integration app), makes chat-app a de facto foundation component without the stability guarantees
- Claudony wires its own push infrastructure — exact duplication, defeats consolidation goal
**Rationale:** Push dataset wiring (mapping qhorus domain objects to push datasets, broadcasting changes via EventBroadcaster) is not chat-app-specific. Any app with qhorus channels uses the same 7 datasets, same column definitions, same snapshot builders. This is qhorus infrastructure, not application logic.
**Trade-offs:** New module in qhorus. But it has clear boundaries and two immediate consumers.
**Exploration:** quick (revised after decision review R1-02, R1-03, R1-09)
**Depends on:** D3
**Status:** revised

## D5: Space hierarchy — exposing qhorus Space model

**Choice:** SpaceResource in qhorus-runtime (not ChatResource) + include spaceId/spaceName in channels push dataset. ChannelController groups channels by space for nav. parentSpaceId supports nested hierarchy out of the box.
**Alternatives:**
- Space data in aggregation only (no Space CRUD endpoints) — smaller API but standalone users can't create spaces via UI, limits flexibility
- Metadata field on channels (rejected) — lazy, ignores that Space already exists as a first-class qhorus entity with full CRUD, store, and channel linking
- Namespace prefix convention (rejected) — fragile, bakes structure into names
**Rationale:** qhorus-api already has Space (id, name, description, parentSpaceId, tenancyId), SpaceStore (full CRUD), SpaceService (create with nesting limits, rename, move, cycle detection), Channel.spaceId, ChannelQuery.bySpaceId()/topLevel(), and ChannelDetail includes spaceId/spaceName. SpaceResource in qhorus-runtime serves all consumers, not just chat-app.
**Trade-offs:** None significant — we're using the platform as designed.
**Exploration:** quick (with first-principles re-evaluation, revised after decision review R1-07)
**Depends on:** D3
**Status:** revised

## D6: ChannelStateController data shape for space-grouped channels

**Choice:** Computed tree property — ChannelStateController exposes a `channelTree: ChannelTree` with `SpaceNode[]` (each containing space metadata, channels, unreadCount, nested children) and `ungrouped: QhorusChannel[]` for root-level channels. Also exposes flat `channels` array for non-nav views (search, feed filters). Recomputes on channel/space changes.
**Alternatives:**
- Flat arrays + groupBy helper — simpler controller but grouping and unread computation duplicated across hosts
- Observable store with selectors — fine-grained but more API surface, multiple calls per render, doesn't compose naturally with Lit reactivity
**Rationale:** The tree is the shape nav needs. Building it is shared logic. Both hosts render the same tree — they just lay it out differently. Flat array still available for other views.
**Trade-offs:** Controller does more computation (tree construction). But this is cheap and eliminates duplication.
**Exploration:** quick
**Depends on:** D1, D2, D5
**Status:** captured

## D7: Chat-app packaging — WITHDRAWN

**Choice:** WITHDRAWN — no longer needed. Reusable infrastructure promoted to qhorus (D3, D4, D5). Chat-app stays a single-module application. Claudony depends on qhorus foundation modules, not on chat-app.
**Original choice:** Split into chat-app-core + chat-app
**Reason withdrawn:** Decision review (R1-02, R1-03) identified that the multi-module split existed solely to service D4's dependency direction. With reusable pieces in qhorus, chat-app has no consumers and doesn't need library packaging.
**Status:** withdrawn
