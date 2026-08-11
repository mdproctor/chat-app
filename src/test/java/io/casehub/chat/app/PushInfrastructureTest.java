package io.casehub.chat.app;

import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.EventStore;
import io.casehub.pages.push.PushColumn;
import io.casehub.pages.push.PushMessage;
import io.casehub.pages.push.TopicRegistry;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@QuarkusTest
class PushInfrastructureTest {

    @Inject
    EventStore eventStore;

    @Inject
    TopicRegistry topicRegistry;

    @Inject
    EventBroadcaster eventBroadcaster;

    @Test
    void eventStoreIsInjectable() {
        assertThat(eventStore).isNotNull();
    }

    @Test
    void broadcastAppendsToEventStore() {
        String json = PushMessage.append("messages",
            List.of(new PushColumn("id", "ID", "LABEL")),
            List.of(List.of("msg-1")));
        long seq = eventBroadcaster.broadcast("test:infra", json);
        assertThat(seq).isGreaterThan(0);

        var events = eventStore.replay("test:infra", 0, 100);
        assertThat(events).isNotEmpty();
        assertThat(events.get(events.size() - 1).seq()).isEqualTo(seq);
    }
}
