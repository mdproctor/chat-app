package io.casehub.chat.app;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@QuarkusTest
class ChatDatasetBuilderTest {

    @Inject
    ChatDatasetBuilder datasetBuilder;

    @Test
    void topicConstantsMatchDatasetNames() {
        assertThat(ChatDatasetBuilder.TOPIC_CHANNELS).isEqualTo("chat:channels");
        assertThat(ChatDatasetBuilder.TOPIC_MESSAGES).isEqualTo("chat:messages");
        assertThat(ChatDatasetBuilder.TOPIC_COMMITMENTS).isEqualTo("chat:commitments");
        assertThat(ChatDatasetBuilder.TOPIC_TOPICS).isEqualTo("chat:topics");
        assertThat(ChatDatasetBuilder.TOPIC_MEMBERS).isEqualTo("chat:members");
        assertThat(ChatDatasetBuilder.TOPIC_PRESENCE).isEqualTo("chat:presence");
        assertThat(ChatDatasetBuilder.TOPIC_REACTIONS).isEqualTo("chat:reactions");
    }

    @Test
    void allTopicsContainsSevenEntries() {
        assertThat(ChatDatasetBuilder.ALL_TOPICS).hasSize(7);
    }

    @Test
    void buildSnapshotReturnsValidPushMessage() {
        String snapshot = datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_CHANNELS);
        assertThat(snapshot).contains("\"op\":\"snapshot\"");
        assertThat(snapshot).contains("\"dataset\":\"channels\"");
    }

    @Test
    void buildSnapshotHandlesAllTopics() {
        for (String topic : ChatDatasetBuilder.ALL_TOPICS) {
            String snapshot = datasetBuilder.buildSnapshot(topic);
            assertThat(snapshot).as("snapshot for " + topic).contains("\"op\":\"snapshot\"");
        }
    }
}
