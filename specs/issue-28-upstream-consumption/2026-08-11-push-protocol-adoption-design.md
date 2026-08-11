# Push Protocol Adoption -- Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Issue:** casehubio/chat-app#29
**Repos:** chat-app, pages (pages-data), pages (push-store-jdbc)

## Problem

chat-app has a bespoke WebSocket implementation (`ChatWebSocketBroadcaster`,
`ConnectionController`) that duplicates infrastructure already provided by
pages-push: connection management, message sequencing, fan-out, and
reconnection. The bespoke approach lacks durability (no event persistence)
and reconnection efficiency (full snapshot on every reconnect, regardless of
how many events were missed).

## Solution

Fully adopt the pages-push stack:

- **Backend:** Replace `ChatWebSocketBroadcaster` with pages-push
  `EventBroadcaster` + `TopicRegistry`. Add `push-store-jdbc` for durable
  JDBC-backed event storage (H2 compatible).
- **Frontend:** Build a new `PushClient` reactive controller in pages-data
  that speaks the PushRequest protocol. Replace `ConnectionController` with
  `PushClient` in chat-app. Keep `ChatDemoAdapter` for parsing dataset ops.

## Non-Goals

- Migrating to WsTriggerPool + restSource pattern (ruled out -- adds
  100ms+ latency from debounce + REST roundtrip, unacceptable for real-time
  chat)
- Changing the frontend data model to per-channel lazy loading (separate
  concern from push infrastructure)
- Building a generic `pushSource()` DataSource in pages-data (PushClient
  is transport-only; DataSource integration is a follow-up)

---

## 1. Topic Model

One pages-push topic per dataset, 7 total:

| Topic | Dataset | Volume |
|-------|---------|--------|
| `chat:channels` | channels | Low |
| `chat:topics` | topics | Low |
| `chat:messages` | messages | High |
| `chat:members` | members | Low |
| `chat:presence` | presence | Medium |
| `chat:reactions` | reactions | Medium |
| `chat:commitments` | commitments | Low |

Each topic has an independent sequence counter in the EventStore. On
reconnect, the client sends a `since` map with its last-seen seq per
topic. The server replays only the missed events for each topic.

First-time connect sends `since: 0` for all topics, which triggers a
full replay -- equivalent to the current snapshot-on-connect behaviour.

---

## 2. PushClient (pages-data)

New file: `packages/pages-data/src/push/push-client.ts`

A Lit `ReactiveController` that manages a single WebSocket connection
to a pages-push endpoint.

### API

```typescript
export class PushClient implements ReactiveController {
  constructor(host: ReactiveControllerHost, options: PushClientOptions);

  readonly state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  readonly attempt: number;

  listen(topics: string[]): void;
  unlisten(topics: string[]): void;
  onMessage(handler: (msg: PushMessage) => void): void;
  offMessage(handler: (msg: PushMessage) => void): void;
  disconnect(): void;
}

interface PushClientOptions {
  url: string | (() => string);
  tokenFn?: () => string | null;
}
```

### Internals

- Maintains `seqs: Map<string, number>` -- last-seen seq per topic,
  updated from each incoming PushMessage's `seq` field
- On `listen(topics)`: if connected, sends `PushRequest.Listen` with
  current `since` map for those topics. If not yet connected, queues
  the topics and sends on open.
- On WebSocket close (retryable): exponential backoff (1s base, 30s cap).
  On reconnect, re-sends `Listen` for all subscribed topics with
  accumulated `since` map -- server replays the delta.
- Non-retryable close codes: 1000 (normal), 1001 (going away), 4401
  (unauthorized), 4403 (forbidden)
- Token passed as `?token=` query parameter on the WebSocket URL
- Each incoming message is dispatched to all registered handlers
- `state` and `attempt` are reactive -- changing them calls
  `host.requestUpdate()` for UI reactivity

### Exports

```typescript
// packages/pages-data/src/push/index.ts
export { PushClient, type PushClientOptions } from './push-client.js';

// packages/pages-data/src/index.ts (add to existing barrel)
export { PushClient, type PushClientOptions } from './push/index.js';
```

---

## 3. Chat-app Backend

### 3a. New dependency

```xml
<dependency>
  <groupId>io.casehub</groupId>
  <artifactId>casehub-pages-push-store-jdbc</artifactId>
  <version>0.2-SNAPSHOT</version>
</dependency>
```

CDI auto-discovers `JdbcEventStore` (higher priority than
`InMemoryEventStore`). H2 compatible -- schema auto-creates via
`@PostConstruct`.

### 3b. ChatPushWebSocket (replaces ChatWebSocket)

New Quarkus WebSocket endpoint at `/ws/push`.

```java
@WebSocket(path = "/ws/push")
public class ChatPushWebSocket {
    @Inject TopicRegistry topicRegistry;
    @Inject EventStore eventStore;
    @Inject ChatDatasetBuilder datasetBuilder;

    @OnOpen
    void onOpen(WebSocketConnection connection) {
        // Register connection; no automatic snapshot.
        // Client must send Listen to receive data.
    }

    @OnTextMessage
    void onMessage(WebSocketConnection connection, String message) {
        PushRequest request = PushRequest.parse(message);
        switch (request) {
            case PushRequest.Listen listen -> {
                topicRegistry.listen(connection.id(), listen.topics());
                for (var entry : listen.since().entrySet()) {
                    String topic = entry.getKey();
                    long since = entry.getValue();
                    if (since == 0) {
                        // First connect: build snapshot from database
                        sendSnapshot(connection, topic);
                    } else {
                        // Reconnect: replay missed events
                        var events = eventStore.replay(topic, since, 10000);
                        if (!events.isEmpty()
                            && events.get(0).seq() > since + 1) {
                            // Gap detected (events were pruned) -- fall back
                            sendSnapshot(connection, topic);
                        } else {
                            for (var event : events) {
                                connection.sendText(event.payloadJson());
                            }
                        }
                    }
                }
            }
            case PushRequest.Unlisten unlisten -> {
                topicRegistry.unlisten(connection.id(), unlisten.topics());
            }
            default -> { /* ignore Subscribe/Unsubscribe for now */ }
        }
    }

    @OnClose
    void onClose(WebSocketConnection connection) {
        topicRegistry.removeConnection(connection.id());
    }
}
```

### 3c. ChatDatasetBuilder (extracted from ChatWebSocketBroadcaster)

New class containing the dataset-building logic extracted from
`ChatWebSocketBroadcaster`:

- All column definitions (`CHANNEL_COLUMNS`, `MESSAGE_COLUMNS`, etc.)
- All `xxxToRow()` methods (`messageToRow`, `commitmentToRow`, etc.)
- `buildSnapshot(topic)` -- builds a full dataset snapshot for a single
  topic (used on first-connect replay)
- Topic-to-dataset mapping (`chat:messages` -> messages dataset)

### 3d. Broadcaster refactoring

`ChatWebSocketBroadcaster` loses its connection management and becomes
a thin facade over `EventBroadcaster`:

```java
@ApplicationScoped
public class ChatWebSocketBroadcaster {
    @Inject EventBroadcaster eventBroadcaster;
    @Inject ChatDatasetBuilder datasetBuilder;

    void pushMessage(ChannelRef channel, OutboundMessage message) {
        var row = datasetBuilder.messageToRow(message, channel);
        var json = PushMessage.append("messages",
            ChatDatasetBuilder.MESSAGE_COLUMNS, List.of(row), 0);
        eventBroadcaster.broadcast("chat:messages", json);
        // seq assigned by EventStore, not by us
    }

    // Similar pattern for all broadcastXxx methods
}
```

The `seq` parameter in `PushMessage.append()` is overridden by
`EventBroadcaster` which assigns the real seq from `EventStore.append()`.

### 3e. What gets deleted

- `ChatWebSocket` (replaced by `ChatPushWebSocket`)
- `CopyOnWriteArraySet<WebSocketConnection> connections` field
- `addConnection` / `removeConnection` methods
- `AtomicLong seq` field
- Private `broadcast(String json)` method

### 3f. WebSocket upgrade

`WebSocketTokenUpgradeCheck` stays -- same auth mechanism, different
endpoint path (`/ws/push` instead of `/ws/chat`).

### 3g. H2 compatibility

`JdbcEventStore` uses `TIMESTAMPTZ` (supported by H2 2.x as alias for
`TIMESTAMP WITH TIME ZONE`) and `ON CONFLICT ... DO UPDATE ... RETURNING`
(supported by H2 2.x). No changes needed to the push-store-jdbc module.

---

## 4. Chat-app Frontend

### 4a. Replace ConnectionController

In `QhorusWorkbenchElement`:

```typescript
// Before
import { ConnectionController } from './connection-controller.js';
private _connection = new ConnectionController(this, { ... });

// After
import { PushClient } from '@casehubio/pages-data/push/push-client.js';
private _push = new PushClient(this, {
  url: () => `${wsProto}//${location.host}/ws/push`,
  tokenFn: getToken,
});
```

On `firstUpdated`:
```typescript
this._push.listen([
  'chat:channels', 'chat:topics', 'chat:messages',
  'chat:members', 'chat:presence', 'chat:reactions',
  'chat:commitments',
]);
this._push.onMessage(op => this._adapter.applyOp(op));
```

### 4b. Connection banner

Reads `this._push.state` and `this._push.attempt` instead of
`this._connection.state` and `this._connection.attempt`. Same
rendering logic.

### 4c. What stays unchanged

- `ChatDemoAdapter` -- parses PushMessage dataset ops into typed arrays
- `SwipeController` -- unrelated
- All event handling, REST calls, panel wiring
- All REST endpoints

### 4d. What gets deleted

- `connection-controller.ts` (replaced by PushClient)
- The manual `ws://` URL construction in `firstUpdated` (PushClient
  handles token injection)

---

## 5. Build Order

| Step | Repo | What |
|------|------|------|
| 1 | pages | PushClient in pages-data + tests |
| 2 | chat-app | Add push-store-jdbc dependency |
| 3 | chat-app | Extract ChatDatasetBuilder from ChatWebSocketBroadcaster |
| 4 | chat-app | Create ChatPushWebSocket endpoint |
| 5 | chat-app | Refactor ChatWebSocketBroadcaster to use EventBroadcaster |
| 6 | chat-app | Frontend: replace ConnectionController with PushClient |
| 7 | chat-app | Delete ChatWebSocket, ConnectionController |
| 8 | both | Verify: reconnection replays delta, not full snapshot |

Steps 2-5 can be committed together (backend migration). Steps 6-7
together (frontend migration). Step 1 must land first.
