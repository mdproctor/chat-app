package io.casehub.chat.app;

import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.EventStore;
import io.casehub.pages.push.InMemoryEventStore;
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

    private final EventStore eventStore = new InMemoryEventStore(10000);
    private final TopicRegistry topicRegistry = new TopicRegistry();
    private final ConcurrentHashMap<String, WebSocketConnection> connections = new ConcurrentHashMap<>();

    @Produces
    @Singleton
    EventStore eventStore() {
        return eventStore;
    }

    @Produces
    @Singleton
    TopicRegistry topicRegistry() {
        return topicRegistry;
    }

    @Produces
    @Singleton
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
            value -> value.toString());
    }

    public void registerConnection(String id, WebSocketConnection conn) {
        connections.put(id, conn);
    }

    public void removeConnection(String id) {
        connections.remove(id);
        topicRegistry.removeConnection(id);
    }
}
