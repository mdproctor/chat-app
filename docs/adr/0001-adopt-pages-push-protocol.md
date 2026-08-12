# ADR-0001: Adopt pages-push protocol for real-time data delivery

**Date:** 2026-08-11
**Status:** Accepted
**Issue:** #29

## Context

chat-app had a bespoke WebSocket implementation (ChatWebSocket, ChatWebSocketBroadcaster, ConnectionController) that managed connections, sequencing, and broadcast independently. This duplicated infrastructure already provided by pages-push (EventBroadcaster, TopicRegistry, EventStore, EventConnection).

The bespoke approach lacked durability (no event persistence) and reconnection efficiency (full snapshot on every reconnect regardless of missed events).

## Decision

Fully adopt the pages-push stack:
- **Backend:** EventBroadcaster + TopicRegistry for fan-out, InMemoryEventStore for dev (JdbcEventStore available for PostgreSQL production)
- **Frontend:** createEventConnection from pages-data (per-topic seq tracking, since-map reconnection)
- **Topic model:** One topic per dataset (7 topics: chat:channels, chat:topics, chat:messages, chat:members, chat:presence, chat:reactions, chat:commitments)

## Alternatives considered

- **EventStore only:** Keep ChatWebSocketBroadcaster, add persistence. Rejected — still duplicates connection management and sequencing.
- **WsTriggerPool + restSource:** WebSocket triggers REST polling. Rejected — adds 100ms+ latency from debounce + roundtrip, unacceptable for real-time chat.
- **Build PushClient in pages-data:** Discovered that createEventConnection already implements the full push protocol client. No new code needed.

## Consequences

- Events are durably stored (InMemoryEventStore for dev, JdbcEventStore for production)
- Reconnection replays only missed events via since-map, not full snapshots
- ChatDemoAdapter unchanged — it parses the same dataset ops from event payloads
- Server must wrap all messages in PushMessage.event() envelopes for EventConnection compatibility
- JdbcEventStore requires PostgreSQL (H2 incompatible with TIMESTAMPTZ and ON CONFLICT RETURNING syntax)
