# Push Protocol Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> subagent-driven-development (recommended) or executing-plans to
> implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural
> editing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #29 — adopt WsTriggerPool + JDBC EventStore for real-time push
**Issue group:** #28, #29, #30, #31, #5, #10

**Goal:** Replace chat-app's bespoke WebSocket push with the pages-push
stack: EventBroadcaster + TopicRegistry + JDBC EventStore on the backend,
createEventConnection from pages-data on the frontend.

**Architecture:** 7 dataset topics with independent seq tracking. Backend
uses EventBroadcaster to append events to JdbcEventStore and fan out via
TopicRegistry. Frontend uses createEventConnection for Listen/Unlisten
with since-map reconnection. ChatDemoAdapter stays for dataset op parsing.

**Tech Stack:** Java 21/Quarkus 3.32, pages-push, push-store-jdbc, H2,
Lit 3/TypeScript, pages-data EventConnection

## Global Constraints

- Java source level 21 (running on Java 26 JVM)
- All casehubio artifacts at `0.2-SNAPSHOT` (except blocks-ui-npm at `0.1-SNAPSHOT`)
- H2 in-memory database for dev/test
- Quarkus websockets-next for WebSocket endpoints
- All tests: Java via `mvn test`, frontend via `npx vitest run`
- Use `ide_*` tools for all .java/.ts file edits — never Edit/Write on source

---

### Task 1: Add push-store-jdbc dependency and CDI wiring

**Files:**
- Modify: `pom.xml`
- Create: `src/main/java/io/casehub/chat/app/PushInfrastructure.java`
- Test: `src/test/java/io/casehub/chat/app/PushInfrastructureTest.java`

**Interfaces:**
- Consumes: `EventStore` (from push-store-jdbc CDI), `EventBroadcaster`, `TopicRegistry`, `SessionSender` (from pages-push)
- Produces: `TopicRegistry` (CDI bean), `EventBroadcaster` (CDI bean), `PushInfrastructure.registerConnection()`, `PushInfrastructure.removeConnection()`

- [ ] **Step 1: Add Maven dependency**

In `pom.xml`, after the `casehub-pages-push` dependency:

```xml
<dependency>
  <groupId>io.casehub</groupId>
  <artifactId>casehub-pages-push-store-jdbc</artifactId>
  <version>0.2-SNAPSHOT</version>
</dependency>
```

- [ ] **Step 2: Write the failing test**

```java
// PushInfrastructureTest.java
@QuarkusTest
class PushInfrastructureTest {

    @Inject
    EventStore eventStore;

    @Inject
    TopicRegistry topicRegistry;

    @Inject
    EventBroadcaster eventBroadcaster;

    @Test
    void eventStoreIsJdbc() {
        assertThat(eventStore).isInstanceOf(JdbcEventStore.class);
    }

    @Test
    void broadcastAppendsToEventStore() {
        String json = PushMessage.append("messages",
            List.of(new PushColumn("id", "ID", "LABEL")),
            List.of(List.of("msg-1")));
        long seq = eventBroadcaster.broadcast("chat:messages", json);
        assertThat(seq).isGreaterThan(0);

        var events = eventStore.replay("chat:messages", 0, 100);
        assertThat(events).hasSize(1);
        assertThat(events.get(0).seq()).isEqualTo(seq);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `JAVA_HOME=$(/usr/libexec/java_home -v 26) mvn test -pl . -Dtest=PushInfrastructureTest -DfailIfNoTests=false`
Expected: FAIL — `TopicRegistry` and `EventBroadcaster` not injectable

- [ ] **Step 4: Write PushInfrastructure CDI producer**

```java
package io.casehub.chat.app;

import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.EventStore;
import io.casehub.pages.push.TopicRegistry;
import io.quarkus.logging.Log;
import io.quarkus.websockets.next.WebSocketConnection;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;

import java.util.concurrent.ConcurrentHashMap;

@ApplicationScoped
public class PushInfrastructure {

    private final TopicRegistry topicRegistry = new TopicRegistry();
    private final ConcurrentHashMap<String, WebSocketConnection> connections = new ConcurrentHashMap<>();

    @Inject
    EventStore eventStore;

    @Produces @Singleton
    TopicRegistry topicRegistry() {
        return topicRegistry;
    }

    @Produces @Singleton
    EventBroadcaster eventBroadcaster() {
        return new EventBroadcaster(eventStore, topicRegistry,
            (connId, msg) -> {
                var conn = connections.get(connId);
                if (conn != null) {
                    conn.sendText(msg).subscribe().with(
                        ignored -> {},
                        err -> Log.warnf("Push send failed for %s: %s", connId, err.getMessage()));
                }
            },
            json -> json);
    }

    public void registerConnection(String id, WebSocketConnection conn) {
        connections.put(id, conn);
    }

    public void removeConnection(String id) {
        connections.remove(id);
        topicRegistry.removeConnection(id);
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `JAVA_HOME=$(/usr/libexec/java_home -v 26) mvn test -pl . -Dtest=PushInfrastructureTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add pom.xml src/main/java/io/casehub/chat/app/PushInfrastructure.java src/test/java/io/casehub/chat/app/PushInfrastructureTest.java
git commit -m "feat(#29): add push-store-jdbc dependency and CDI wiring

Wire EventBroadcaster + TopicRegistry + JdbcEventStore via CDI producer.
SessionSender delegates to WebSocketConnection map. Refs #29"
```

---

### Task 2: Extract ChatDatasetBuilder from ChatWebSocketBroadcaster

**Files:**
- Create: `src/main/java/io/casehub/chat/app/ChatDatasetBuilder.java`
- Modify: `src/main/java/io/casehub/chat/app/ChatWebSocketBroadcaster.java`
- Test: `src/test/java/io/casehub/chat/app/ChatDatasetBuilderTest.java`

**Interfaces:**
- Consumes: `ChannelReader`, `ConsumerMessaging`, `MembershipReader`, `ReactionReader`, `CommitmentReader`, `TopicReader`, `TopicManager`, `PresenceTracker` (all from qhorus)
- Produces: `ChatDatasetBuilder.buildSnapshot(String topic): String`, `ChatDatasetBuilder.messageToRow(Message): List<String>`, column constants (`MESSAGE_COLUMNS`, etc.), topic constants (`TOPIC_MESSAGES`, etc.)

- [ ] **Step 1: Write the failing test**

```java
@QuarkusTest
class ChatDatasetBuilderTest {

    @Inject
    ChatDatasetBuilder datasetBuilder;

    @Test
    void topicConstantsMatchDatasetNames() {
        assertThat(ChatDatasetBuilder.TOPIC_CHANNELS).isEqualTo("chat:channels");
        assertThat(ChatDatasetBuilder.TOPIC_MESSAGES).isEqualTo("chat:messages");
        assertThat(ChatDatasetBuilder.TOPIC_COMMITMENTS).isEqualTo("chat:commitments");
    }

    @Test
    void buildSnapshotReturnsValidPushMessage() {
        String snapshot = datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_CHANNELS);
        assertThat(snapshot).contains("\"op\":\"snapshot\"");
        assertThat(snapshot).contains("\"dataset\":\"channels\"");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `JAVA_HOME=$(/usr/libexec/java_home -v 26) mvn test -pl . -Dtest=ChatDatasetBuilderTest -DfailIfNoTests=false`
Expected: FAIL — `ChatDatasetBuilder` does not exist

- [ ] **Step 3: Create ChatDatasetBuilder**

Extract from `ChatWebSocketBroadcaster`:
- All `*_COLUMNS` static fields
- All `*ToRow()` methods
- The `buildSnapshot()` logic (split into per-topic methods)
- Topic name constants: `TOPIC_CHANNELS = "chat:channels"`, etc.
- `toJson()` helper

```java
package io.casehub.chat.app;

import io.casehub.pages.push.PushColumn;
import io.casehub.pages.push.PushMessage;
// ... (same imports as ChatWebSocketBroadcaster for readers)
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class ChatDatasetBuilder {

    public static final String TOPIC_CHANNELS    = "chat:channels";
    public static final String TOPIC_TOPICS      = "chat:topics";
    public static final String TOPIC_MESSAGES    = "chat:messages";
    public static final String TOPIC_MEMBERS     = "chat:members";
    public static final String TOPIC_PRESENCE    = "chat:presence";
    public static final String TOPIC_REACTIONS   = "chat:reactions";
    public static final String TOPIC_COMMITMENTS = "chat:commitments";

    public static final List<String> ALL_TOPICS = List.of(
        TOPIC_CHANNELS, TOPIC_TOPICS, TOPIC_MESSAGES,
        TOPIC_MEMBERS, TOPIC_PRESENCE, TOPIC_REACTIONS, TOPIC_COMMITMENTS);

    // Move all *_COLUMNS here (unchanged)
    public static final List<PushColumn> CHANNEL_COLUMNS = List.of(/* ... */);
    // ... etc for all 7

    @Inject ChannelReader channelReader;
    @Inject ConsumerMessaging messaging;
    @Inject MembershipReader memberReader;
    @Inject ReactionReader reactionReader;
    @Inject CommitmentReader commitmentReader;
    @Inject TopicReader topicReader;
    @Inject TopicManager topicManager;
    @Inject PresenceTracker presenceTracker;
    @Inject ObjectMapper objectMapper;

    public String buildSnapshot(String topic) {
        return switch (topic) {
            case TOPIC_CHANNELS -> buildChannelSnapshot();
            case TOPIC_TOPICS -> buildTopicSnapshot();
            case TOPIC_MESSAGES -> buildMessageSnapshot();
            case TOPIC_MEMBERS -> buildMemberSnapshot();
            case TOPIC_PRESENCE -> buildPresenceSnapshot();
            case TOPIC_REACTIONS -> buildReactionSnapshot();
            case TOPIC_COMMITMENTS -> buildCommitmentSnapshot();
            default -> throw new IllegalArgumentException("Unknown topic: " + topic);
        };
    }

    // Move all xxxToRow() methods here (unchanged)
    // Move buildSnapshot per-dataset logic from current buildSnapshot()
    // Move toJson() helper
}
```

- [ ] **Step 4: Update ChatWebSocketBroadcaster to delegate to ChatDatasetBuilder**

Replace column definitions and row builders with `@Inject ChatDatasetBuilder` and delegate. Keep the broadcast methods for now (they still use the old connection management — refactored in Task 4).

- [ ] **Step 5: Run full test suite**

Run: `JAVA_HOME=$(/usr/libexec/java_home -v 26) mvn test`
Expected: All tests PASS (no behavioral change)

- [ ] **Step 6: Commit**

```bash
git add src/main/java/io/casehub/chat/app/ChatDatasetBuilder.java \
  src/main/java/io/casehub/chat/app/ChatWebSocketBroadcaster.java \
  src/test/java/io/casehub/chat/app/ChatDatasetBuilderTest.java
git commit -m "refactor(#29): extract ChatDatasetBuilder from broadcaster

Move column definitions, row builders, and snapshot logic into
ChatDatasetBuilder. Broadcaster delegates to it. No behavioral change.
Refs #29"
```

---

### Task 3: Create ChatPushWebSocket endpoint

**Files:**
- Create: `src/main/java/io/casehub/chat/app/ChatPushWebSocket.java`
- Modify: `src/main/java/io/casehub/chat/app/WebSocketTokenUpgradeCheck.java` (add `/ws/push` path)
- Test: existing `ChatWebSocketTest.java` extended or new `ChatPushWebSocketTest.java`

**Interfaces:**
- Consumes: `PushInfrastructure.registerConnection()`, `PushInfrastructure.removeConnection()`, `TopicRegistry.listen()`, `EventStore.replay()`, `ChatDatasetBuilder.buildSnapshot()`
- Produces: WebSocket endpoint at `/ws/push` handling PushRequest.Listen and PushRequest.Unlisten

- [ ] **Step 1: Write the failing test**

```java
@QuarkusTest
class ChatPushWebSocketTest {

    @TestHTTPResource("/ws/push")
    URI wsUri;

    @Inject
    EventBroadcaster eventBroadcaster;

    @Test
    void listenWithSinceZeroReturnsSnapshot() throws Exception {
        // Connect with token
        var container = ContainerProvider.getWebSocketContainer();
        var session = container.connectToServer(TestClient.class,
            URI.create(wsUri + "?token=" + getTestToken()));

        // Send Listen request
        String listenRequest = """
            {"op":"listen","id":"1","topics":["chat:channels"],"since":{"chat:channels":0}}""";
        session.getBasicRemote().sendText(listenRequest);

        // Should receive a snapshot
        var message = TestClient.awaitMessage(2, TimeUnit.SECONDS);
        assertThat(message).contains("\"op\":\"snapshot\"");
        assertThat(message).contains("\"dataset\":\"channels\"");
        session.close();
    }

    @Test
    void broadcastAfterListenDeliversEvent() throws Exception {
        var container = ContainerProvider.getWebSocketContainer();
        var session = container.connectToServer(TestClient.class,
            URI.create(wsUri + "?token=" + getTestToken()));

        String listenRequest = """
            {"op":"listen","id":"1","topics":["chat:messages"],"since":{"chat:messages":0}}""";
        session.getBasicRemote().sendText(listenRequest);
        TestClient.awaitMessage(2, TimeUnit.SECONDS); // consume snapshot

        // Broadcast an event
        String pushJson = PushMessage.append("messages",
            ChatDatasetBuilder.MESSAGE_COLUMNS,
            List.of(List.of("ch-1", "1", null, "alice", "hello",
                "2026-01-01T00:00:00Z", "EVENT", "HUMAN", "", null, "[]", null)));
        eventBroadcaster.broadcast("chat:messages", pushJson);

        var event = TestClient.awaitMessage(2, TimeUnit.SECONDS);
        assertThat(event).contains("\"op\":\"event\"");
        assertThat(event).contains("chat:messages");
        session.close();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — no endpoint at `/ws/push`

- [ ] **Step 3: Create ChatPushWebSocket**

```java
package io.casehub.chat.app;

import io.casehub.pages.push.EventStore;
import io.casehub.pages.push.PushRequest;
import io.casehub.pages.push.TopicRegistry;
import io.quarkus.websockets.next.OnClose;
import io.quarkus.websockets.next.OnOpen;
import io.quarkus.websockets.next.OnTextMessage;
import io.quarkus.websockets.next.WebSocket;
import io.quarkus.websockets.next.WebSocketConnection;
import jakarta.inject.Inject;

@WebSocket(path = "/ws/push")
public class ChatPushWebSocket {

    @Inject PushInfrastructure pushInfra;
    @Inject TopicRegistry topicRegistry;
    @Inject EventStore eventStore;
    @Inject ChatDatasetBuilder datasetBuilder;

    @OnOpen
    void onOpen(WebSocketConnection connection) {
        pushInfra.registerConnection(connection.id(), connection);
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
                        connection.sendText(datasetBuilder.buildSnapshot(topic))
                            .subscribe().with(ignored -> {}, err -> {});
                    } else {
                        var events = eventStore.replay(topic, since, 10000);
                        if (!events.isEmpty() && events.get(0).seq() > since + 1) {
                            connection.sendText(datasetBuilder.buildSnapshot(topic))
                                .subscribe().with(ignored -> {}, err -> {});
                        } else {
                            for (var event : events) {
                                connection.sendText(event.payloadJson())
                                    .subscribe().with(ignored -> {}, err -> {});
                            }
                        }
                    }
                }
            }
            case PushRequest.Unlisten unlisten ->
                topicRegistry.unlisten(connection.id(), unlisten.topics());
            default -> { }
        }
    }

    @OnClose
    void onClose(WebSocketConnection connection) {
        pushInfra.removeConnection(connection.id());
    }
}
```

- [ ] **Step 4: Update WebSocketTokenUpgradeCheck for /ws/push**

Add `/ws/push` to the paths checked by the upgrade filter (if it currently only checks `/ws/chat`).

- [ ] **Step 5: Run tests**

Run: `JAVA_HOME=$(/usr/libexec/java_home -v 26) mvn test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/io/casehub/chat/app/ChatPushWebSocket.java \
  src/main/java/io/casehub/chat/app/WebSocketTokenUpgradeCheck.java \
  src/test/java/io/casehub/chat/app/ChatPushWebSocketTest.java
git commit -m "feat(#29): add ChatPushWebSocket endpoint with Listen/replay

New /ws/push endpoint handles PushRequest.Listen with since-map replay.
since=0 sends full snapshot from database. since>0 replays from
JdbcEventStore with gap detection fallback. Refs #29"
```

---

### Task 4: Refactor ChatWebSocketBroadcaster to use EventBroadcaster

**Files:**
- Modify: `src/main/java/io/casehub/chat/app/ChatWebSocketBroadcaster.java`
- Modify: `src/main/java/io/casehub/chat/app/ChatAppChannelBackend.java` (if it calls broadcaster directly)
- Test: existing `ChatResourceTest.java`, `ChatWebSocketTest.java`

**Interfaces:**
- Consumes: `EventBroadcaster.broadcast(String topic, String payloadJson)`, `ChatDatasetBuilder.*_COLUMNS`, `ChatDatasetBuilder.*ToRow()`
- Produces: same public API as before (pushMessage, broadcastChannelAppend, etc.) — callers unchanged

- [ ] **Step 1: Refactor broadcaster to delegate to EventBroadcaster**

Remove from ChatWebSocketBroadcaster:
- `CopyOnWriteArraySet<WebSocketConnection> connections`
- `AtomicLong seq`
- `addConnection()`, `removeConnection()`, `broadcast()` methods

Add:
- `@Inject EventBroadcaster eventBroadcaster`
- `@Inject ChatDatasetBuilder datasetBuilder`

Each `broadcastXxx()` method becomes:
```java
void pushMessage(ChannelRef channel, OutboundMessage message) {
    var row = datasetBuilder.outboundMessageToRow(channel, message);
    var json = PushMessage.append("messages",
        ChatDatasetBuilder.MESSAGE_COLUMNS, List.of(row));
    eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_MESSAGES, json);
}
```

Same pattern for `broadcastChannelAppend`, `broadcastPresenceReplace`, etc.

- [ ] **Step 2: Update ChatWebSocket to not use broadcaster connection management**

`ChatWebSocket.onOpen` currently calls `broadcaster.addConnection()`. Since the old ChatWebSocket will be deleted in Task 6, update it to be a no-op for now or redirect to PushInfrastructure.

- [ ] **Step 3: Run full test suite**

Run: `JAVA_HOME=$(/usr/libexec/java_home -v 26) mvn test`
Expected: PASS — events now persisted in EventStore AND delivered via TopicRegistry

- [ ] **Step 4: Commit**

```bash
git add src/main/java/io/casehub/chat/app/ChatWebSocketBroadcaster.java \
  src/main/java/io/casehub/chat/app/ChatWebSocket.java
git commit -m "refactor(#29): broadcaster delegates to EventBroadcaster

Remove connection management from ChatWebSocketBroadcaster. All
broadcastXxx methods now call eventBroadcaster.broadcast with the
appropriate topic. Events are durably stored in JdbcEventStore. Refs #29"
```

---

### Task 5: Frontend — replace ConnectionController with EventConnection

**Files:**
- Modify: `src/main/webui/src/workbench/qhorus-workbench.ts`
- Modify: `src/main/webui/src/workbench/qhorus-workbench.test.ts`
- Test: vitest

**Interfaces:**
- Consumes: `createEventConnection` from `@casehubio/pages-data`, `ChatDemoAdapter.applyOp()`
- Produces: reactive `_pushStatus` property for connection banner

- [ ] **Step 1: Update workbench to use createEventConnection**

Replace ConnectionController with createEventConnection from pages-data.

In `qhorus-workbench.ts`:

```typescript
// Remove:
import { ConnectionController } from './connection-controller.js';

// Add:
import { createEventConnection } from '@casehubio/pages-data/dataset/external/sources/event-connection.js';
import type { EventConnection, ConnectionStatus } from '@casehubio/pages-data';
```

Replace `_connection` field:
```typescript
private _eventConn?: EventConnection;
@state() private _pushStatus: ConnectionStatus = 'disconnected';
```

Replace `firstUpdated`:
```typescript
override firstUpdated() {
    const token = getToken();
    if (token && this.endpoint) {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${location.host}/ws/push?token=${token}`;
        const eventTarget = new EventTarget();

        this._eventConn = createEventConnection(url, {
            config: { eventTarget },
            onStatusChange: (status) => { this._pushStatus = status; },
        });

        this._eventConn.listen([
            'chat:channels', 'chat:topics', 'chat:messages',
            'chat:members', 'chat:presence', 'chat:reactions',
            'chat:commitments',
        ]);

        eventTarget.addEventListener('pages-event', (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.payload) {
                this._adapter.applyOp(detail.payload);
            }
        });
    }
}
```

Update `disconnectedCallback`:
```typescript
this._eventConn?.close();
```

Update connection banner to read `this._pushStatus` instead of `this._connection.state`.

- [ ] **Step 2: Update tests**

Update WebSocket-related tests to mock the new connection pattern. Connection banner tests check `_pushStatus` instead of `_connection.state`.

- [ ] **Step 3: Run vitest**

Run: `npx vitest run` from `src/main/webui`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/webui/src/workbench/qhorus-workbench.ts \
  src/main/webui/src/workbench/qhorus-workbench.test.ts
git commit -m "feat(#29): replace ConnectionController with pages-data EventConnection

Wire createEventConnection for push protocol. Listen to all 7 dataset
topics with since-map reconnection. ChatDemoAdapter processes events
unchanged. Connection banner reads pushStatus. Refs #29"
```

---

### Task 6: Delete old WebSocket infrastructure

**Files:**
- Delete: `src/main/java/io/casehub/chat/app/ChatWebSocket.java`
- Delete: `src/main/webui/src/workbench/connection-controller.ts`
- Modify: `src/main/webui/src/workbench/connection-controller.test.ts` (delete or migrate)
- Modify: `src/main/webui/src/workbench/qhorus-workbench.ts` (remove swipe controller ref to old connection if any)

**Interfaces:**
- Consumes: nothing (cleanup task)
- Produces: nothing

- [ ] **Step 1: Delete ChatWebSocket.java**

Use `ide_refactor_safe_delete` to remove `ChatWebSocket.java`. Verify no remaining references.

- [ ] **Step 2: Delete connection-controller.ts**

Remove the file and its test file. Verify no remaining imports.

- [ ] **Step 3: Run full test suites**

Run: `JAVA_HOME=$(/usr/libexec/java_home -v 26) mvn test`
Run: `npx vitest run` from `src/main/webui`
Expected: Both PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(#29): delete old WebSocket infrastructure

Remove ChatWebSocket (replaced by ChatPushWebSocket) and
ConnectionController (replaced by pages-data EventConnection). Refs #29"
```
