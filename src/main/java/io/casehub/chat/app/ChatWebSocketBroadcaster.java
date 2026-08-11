package io.casehub.chat.app;

import io.casehub.pages.push.PushMessage;
import io.casehub.qhorus.api.channel.Channel;
import io.casehub.qhorus.api.channel.ChannelMembership;
import io.casehub.qhorus.api.channel.PresenceStatus;
import io.casehub.qhorus.api.gateway.ChannelRef;
import io.casehub.qhorus.api.gateway.OutboundMessage;
import io.casehub.qhorus.api.message.Commitment;
import io.casehub.qhorus.api.message.Topic;
import java.time.Instant;
import io.quarkus.logging.Log;
import io.quarkus.websockets.next.WebSocketConnection;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.atomic.AtomicLong;

@ApplicationScoped
public class ChatWebSocketBroadcaster {

    private final Set<WebSocketConnection> connections = new CopyOnWriteArraySet<>();
    private final AtomicLong seq = new AtomicLong(0);

    @Inject
    ChatDatasetBuilder datasetBuilder;

    void addConnection(WebSocketConnection connection) {
        connections.add(connection);
    }

    void removeConnection(WebSocketConnection connection) {
        connections.remove(connection);
    }

    void registerChannel(UUID channelId, String channelName) {
    }

    void deregisterChannel(ChannelRef channel) {
    }

    String buildSnapshot() {
        return PushMessage.batch(
                datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_CHANNELS, seq.incrementAndGet()),
                datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_TOPICS, seq.incrementAndGet()),
                datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_MESSAGES, seq.incrementAndGet()),
                datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_MEMBERS, seq.incrementAndGet()),
                datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_PRESENCE, seq.incrementAndGet()),
                datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_REACTIONS, seq.incrementAndGet()),
                datasetBuilder.buildSnapshot(ChatDatasetBuilder.TOPIC_COMMITMENTS, seq.incrementAndGet()));
    }

    void pushMessage(ChannelRef channel, OutboundMessage message) {
        var row = datasetBuilder.outboundMessageToRow(channel, message);
        broadcast(PushMessage.append("messages", ChatDatasetBuilder.MESSAGE_COLUMNS, List.of(row), seq.incrementAndGet()));
    }

    void broadcastChannelAppend(Channel channel) {
        broadcast(PushMessage.append("channels", ChatDatasetBuilder.CHANNEL_COLUMNS,
            List.of(List.of(channel.id().toString(), channel.name(), "",
                channel.description() != null ? channel.description() : "", "false")),
            seq.incrementAndGet()));
    }

    void broadcastChannelRemove(UUID channelId) {
        broadcast(PushMessage.remove("channels", channelId.toString(), seq.incrementAndGet()));
    }

    void broadcastPresenceReplace(String memberId, PresenceStatus status) {
        broadcast(PushMessage.replace("presence", ChatDatasetBuilder.PRESENCE_COLUMNS, memberId,
            List.of(memberId, status.name(), Instant.now().toString()),
            seq.incrementAndGet()));
    }

    void broadcastMemberAppend(UUID channelId, ChannelMembership membership) {
        String membershipId = channelId.toString() + ":" + membership.memberId();
        broadcast(PushMessage.append("members", ChatDatasetBuilder.MEMBER_COLUMNS,
            List.of(List.of(membershipId, channelId.toString(),
                membership.memberId(), membership.memberId(), membership.role().name())),
            seq.incrementAndGet()));
    }

    void broadcastMemberRemove(UUID channelId, String memberId) {
        broadcast(PushMessage.remove("members", channelId.toString() + ":" + memberId, seq.incrementAndGet()));
    }

    void broadcastReactionAppend(Long messageId, String emoji) {
        broadcast(PushMessage.append("reactions", ChatDatasetBuilder.REACTION_COLUMNS,
            List.of(List.of(String.valueOf(messageId), emoji)),
            seq.incrementAndGet()));
    }

    void broadcastReactionRemove(Long messageId, String emoji) {
        broadcast(PushMessage.remove("reactions", String.valueOf(messageId) + ":" + emoji, seq.incrementAndGet()));
    }

    void broadcastCommitment(Commitment commitment) {
        broadcast(PushMessage.replace("commitments", ChatDatasetBuilder.COMMITMENT_COLUMNS,
            commitment.correlationId(), datasetBuilder.commitmentToRow(commitment),
            seq.incrementAndGet()));
    }

    void broadcastCommitmentAppend(Commitment commitment) {
        broadcast(PushMessage.append("commitments", ChatDatasetBuilder.COMMITMENT_COLUMNS,
            List.of(datasetBuilder.commitmentToRow(commitment)),
            seq.incrementAndGet()));
    }

    void broadcastTopicAppend(UUID channelId, Topic topic) {
        broadcast(PushMessage.append("topics", ChatDatasetBuilder.TOPIC_COLUMNS,
            List.of(datasetBuilder.topicToRow(channelId, topic)),
            seq.incrementAndGet()));
    }

    void broadcastTopicReplace(UUID channelId, Topic topic) {
        broadcast(PushMessage.replace("topics", ChatDatasetBuilder.TOPIC_COLUMNS,
            String.valueOf(topic.id()), datasetBuilder.topicToRow(channelId, topic),
            seq.incrementAndGet()));
    }

    void broadcastTopicRemove(UUID channelId, Long topicId) {
        broadcast(PushMessage.remove("topics", String.valueOf(topicId), seq.incrementAndGet()));
    }

    private void broadcast(String json) {
        connections.forEach(c -> c.sendText(json).subscribe().with(
                ignored -> {},
                err -> Log.warnf("WebSocket send failed: %s", err.getMessage())));
    }


}
