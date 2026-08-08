package io.casehub.chat.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.casehub.pages.push.PushColumn;
import io.casehub.pages.push.PushMessage;
import io.casehub.qhorus.api.channel.Channel;
import io.casehub.qhorus.api.channel.ChannelMembership;
import io.casehub.qhorus.api.channel.ChannelReader;
import io.casehub.qhorus.api.channel.PresenceStatus;
import io.casehub.qhorus.api.channel.PresenceTracker;
import io.casehub.qhorus.api.channel.TopicManager;
import io.casehub.qhorus.api.gateway.ChannelRef;
import io.casehub.qhorus.api.gateway.OutboundMessage;
import io.casehub.qhorus.api.message.Commitment;
import io.casehub.qhorus.api.message.ConsumerMessaging;
import io.casehub.qhorus.api.message.Message;
import io.casehub.qhorus.api.message.Topic;
import io.casehub.qhorus.api.store.CommitmentReader;
import io.casehub.qhorus.api.store.MembershipReader;
import io.casehub.qhorus.api.store.ReactionReader;
import io.casehub.qhorus.api.store.TopicReader;
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

    private static final List<PushColumn> CHANNEL_COLUMNS    = List.of(
            new PushColumn("id", "ID", "LABEL"),
            new PushColumn("name", "Name", "LABEL"),
            new PushColumn("topic", "Topic", "LABEL"),
            new PushColumn("description", "Description", "LABEL"),
            new PushColumn("isPrivate", "Private", "LABEL"));
    private static final List<PushColumn> MESSAGE_COLUMNS    = List.of(
            new PushColumn("channelId", "Channel", "LABEL"),
            new PushColumn("messageId", "Message ID", "LABEL"),
            new PushColumn("parentId", "Parent", "LABEL"),
            new PushColumn("senderId", "Sender", "LABEL"),
            new PushColumn("text", "Text", "LABEL"),
            new PushColumn("timestamp", "Timestamp", "DATE"),
            new PushColumn("messageType", "Type", "LABEL"),
            new PushColumn("actorType", "Actor", "LABEL"),
            new PushColumn("topicId", "Topic", "LABEL"),
            new PushColumn("correlationId", "Correlation", "LABEL"),
            new PushColumn("artefactRefs", "Artefacts", "LABEL"),
            new PushColumn("target", "Target", "LABEL"));
    private static final List<PushColumn> MEMBER_COLUMNS     = List.of(
            new PushColumn("membershipId", "Membership", "LABEL"),
            new PushColumn("channelId", "Channel", "LABEL"),
            new PushColumn("memberId", "Member", "LABEL"),
            new PushColumn("displayName", "Display Name", "LABEL"),
            new PushColumn("role", "Role", "LABEL"));
    private static final List<PushColumn> PRESENCE_COLUMNS   = List.of(
            new PushColumn("memberId", "Member", "LABEL"),
            new PushColumn("status", "Status", "LABEL"),
            new PushColumn("lastActiveAt", "Last Active", "DATE"));
    private static final List<PushColumn> REACTION_COLUMNS   = List.of(
            new PushColumn("messageId", "Message ID", "LABEL"),
            new PushColumn("emoji", "Emoji", "LABEL"));
    private static final List<PushColumn> COMMITMENT_COLUMNS = List.of(
            new PushColumn("correlationId", "Correlation", "LABEL"),
            new PushColumn("channelId", "Channel", "LABEL"),
            new PushColumn("state", "State", "LABEL"),
            new PushColumn("deadline", "Deadline", "DATE"),
            new PushColumn("acknowledgedAt", "Acknowledged", "DATE"),
            new PushColumn("resolvedAt", "Resolved", "DATE"),
            new PushColumn("createdAt", "Created", "DATE"));
    private static final List<PushColumn> TOPIC_COLUMNS      = List.of(
            new PushColumn("topicId", "Topic ID", "LABEL"),
            new PushColumn("channelId", "Channel", "LABEL"),
            new PushColumn("name", "Name", "LABEL"),
            new PushColumn("state", "State", "LABEL"),
            new PushColumn("messageCount", "Messages", "LABEL"),
            new PushColumn("latestActivityTs", "Latest", "DATE"),
            new PushColumn("createdAt", "Created", "DATE"));
    private final        Set<WebSocketConnection>  connections        = new CopyOnWriteArraySet<>();
    private final        AtomicLong                seq                = new AtomicLong(0);

    @Inject
    ObjectMapper      objectMapper;
    @Inject
    ChannelReader     channelReader;
    @Inject
    ConsumerMessaging messaging;
    @Inject
    MembershipReader  memberReader;
    @Inject
    ReactionReader    reactionReader;
    @Inject
    CommitmentReader  commitmentReader;
    @Inject
    TopicReader       topicReader;
    @Inject
    PresenceTracker   presenceTracker;
    @Inject
    TopicManager      topicManager;

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
        var channels = channelReader.listAll();

        var channelRows = channels.stream()
                                  .map(ch -> List.of(
                                          ch.id().toString(), ch.name(), "", ch.description() != null ? ch.description() : "", "false"))
                                  .toList();

        var topicRows = new ArrayList<List<String>>();
        for (var ch : channels) {
            for (var ts : topicManager.listTopics(ch.id())) {
                var  topic   = topicReader.find(ch.id(), ts.name());
                Long topicId = topic.map(Topic::id).orElse(null);
                topicRows.add(List.of(
                        topicId != null ? String.valueOf(topicId) : ts.name(),
                        ch.id().toString(), ts.name(),
                        ts.resolved() ? "RESOLVED" : "ACTIVE",
                        String.valueOf(ts.messageCount()),
                        ts.lastActivityAt() != null ? ts.lastActivityAt().toString() : "",
                        topic.map(t -> t.createdAt().toString()).orElse("")));
            }
        }

        var messageRows = new ArrayList<List<String>>();
        for (var ch : channels) {
            for (var msg : messaging.history(ch.id(), 0, 10000)) {
                messageRows.add(messageToRow(msg));
            }
        }

        var memberRows = new ArrayList<List<String>>();
        for (var ch : channels) {
            for (var m : memberReader.findByChannel(ch.id())) {
                String membershipId = ch.id().toString() + ":" + m.memberId();
                memberRows.add(List.of(membershipId, ch.id().toString(), m.memberId(), m.memberId(), m.role().name()));
            }
        }

        var reactionRows = new ArrayList<List<String>>();
        for (var ch : channels) {
            var msgs   = messaging.history(ch.id(), 0, 10000);
            var msgIds = msgs.stream().map(Message::id).toList();
            if (!msgIds.isEmpty()) {
                var reactionsMap = reactionReader.findByMessages(msgIds);
                for (var entry : reactionsMap.entrySet()) {
                    for (var r : entry.getValue()) {
                        reactionRows.add(List.of(String.valueOf(r.messageId()), r.emoji()));
                    }
                }
            }
        }

        var presenceRows = new ArrayList<List<String>>();
        for (var ch : channels) {
            for (var p : presenceTracker.getChannelPresence(ch.id())) {
                presenceRows.add(List.of(p.memberId(), p.status().name(),
                                         p.lastSeenAt() != null ? p.lastSeenAt().toString() : ""));
            }
        }

        var commitmentRows = new ArrayList<List<String>>();
        for (var ch : channels) {
            for (var c : commitmentReader.findByChannel(ch.id())) {
                commitmentRows.add(commitmentToRow(c));
            }
        }

        return PushMessage.batch(
                PushMessage.snapshot("channels", CHANNEL_COLUMNS, channelRows, seq.incrementAndGet()),
                PushMessage.snapshot("topics", TOPIC_COLUMNS, topicRows, seq.incrementAndGet()),
                PushMessage.snapshot("messages", MESSAGE_COLUMNS, messageRows, seq.incrementAndGet()),
                PushMessage.snapshot("members", MEMBER_COLUMNS, memberRows, seq.incrementAndGet()),
                PushMessage.snapshot("presence", PRESENCE_COLUMNS, presenceRows, seq.incrementAndGet()),
                PushMessage.snapshot("reactions", REACTION_COLUMNS, reactionRows, seq.incrementAndGet()),
                PushMessage.snapshot("commitments", COMMITMENT_COLUMNS, commitmentRows, seq.incrementAndGet()));
    }

    void pushMessage(ChannelRef channel, OutboundMessage message) {
        String artefactRefsJson = "[]";
        if (message.artefactRefs() != null && !message.artefactRefs().isEmpty()) {
            artefactRefsJson = toJson(message.artefactRefs());
        }
        var row = new ArrayList<String>(12);
        row.add(channel.id().toString());
        row.add(String.valueOf(message.sequenceId()));
        row.add(message.inReplyTo() != null ? String.valueOf(message.inReplyTo()) : null);
        row.add(message.sender());
        row.add(message.content());
        row.add(Instant.now().toString());
        row.add(message.type().name());
        row.add(message.senderActorType().name());
        row.add(message.topic() != null ? message.topic() : "");
        row.add(message.correlationId());
        row.add(artefactRefsJson);
        row.add(message.target());
        broadcast(PushMessage.append("messages", MESSAGE_COLUMNS, List.of(row), seq.incrementAndGet()));
    }

    void broadcastChannelAppend(Channel channel) {
        broadcast(PushMessage.append("channels", CHANNEL_COLUMNS,
                                     List.of(List.of(channel.id().toString(), channel.name(), "",
                                                     channel.description() != null ? channel.description() : "", "false")),
                                     seq.incrementAndGet()));
    }

    void broadcastChannelRemove(UUID channelId) {
        broadcast(PushMessage.remove("channels", channelId.toString(), seq.incrementAndGet()));
    }

    void broadcastPresenceReplace(String memberId, PresenceStatus status) {
        broadcast(PushMessage.replace("presence", PRESENCE_COLUMNS, memberId,
                                      List.of(memberId, status.name(), Instant.now().toString()),
                                      seq.incrementAndGet()));
    }

    void broadcastMemberAppend(UUID channelId, ChannelMembership membership) {
        String membershipId = channelId.toString() + ":" + membership.memberId();
        broadcast(PushMessage.append("members", MEMBER_COLUMNS,
                                     List.of(List.of(membershipId, channelId.toString(),
                                                     membership.memberId(), membership.memberId(), membership.role().name())),
                                     seq.incrementAndGet()));
    }

    void broadcastMemberRemove(UUID channelId, String memberId) {
        broadcast(PushMessage.remove("members", channelId.toString() + ":" + memberId, seq.incrementAndGet()));
    }

    void broadcastReactionAppend(Long messageId, String emoji) {
        broadcast(PushMessage.append("reactions", REACTION_COLUMNS,
                                     List.of(List.of(String.valueOf(messageId), emoji)),
                                     seq.incrementAndGet()));
    }

    void broadcastReactionRemove(Long messageId, String emoji) {
        broadcast(PushMessage.remove("reactions", String.valueOf(messageId) + ":" + emoji, seq.incrementAndGet()));
    }

    void broadcastCommitment(Commitment commitment) {
        broadcast(PushMessage.replace("commitments", COMMITMENT_COLUMNS,
                                      commitment.correlationId(), commitmentToRow(commitment),
                                      seq.incrementAndGet()));
    }

    void broadcastCommitmentAppend(Commitment commitment) {
        broadcast(PushMessage.append("commitments", COMMITMENT_COLUMNS,
                                     List.of(commitmentToRow(commitment)),
                                     seq.incrementAndGet()));
    }

    void broadcastTopicAppend(UUID channelId, Topic topic) {
        broadcast(PushMessage.append("topics", TOPIC_COLUMNS,
                                     List.of(topicToRow(channelId, topic)),
                                     seq.incrementAndGet()));
    }

    void broadcastTopicReplace(UUID channelId, Topic topic) {
        broadcast(PushMessage.replace("topics", TOPIC_COLUMNS,
                                      String.valueOf(topic.id()), topicToRow(channelId, topic),
                                      seq.incrementAndGet()));
    }

    void broadcastTopicRemove(UUID channelId, Long topicId) {
        broadcast(PushMessage.remove("topics", String.valueOf(topicId), seq.incrementAndGet()));
    }

    private List<String> topicToRow(UUID channelId, Topic topic) {
        return List.of(
                String.valueOf(topic.id()), channelId.toString(), topic.name(),
                topic.resolved() ? "RESOLVED" : "ACTIVE",
                "0", topic.createdAt() != null ? topic.createdAt().toString() : "",
                topic.createdAt() != null ? topic.createdAt().toString() : "");
    }

    private List<String> commitmentToRow(Commitment c) {
        return List.of(
                c.correlationId(), c.channelId().toString(), c.state().name(),
                c.expiresAt() != null ? c.expiresAt().toString() : "",
                c.acknowledgedAt() != null ? c.acknowledgedAt().toString() : "",
                c.resolvedAt() != null ? c.resolvedAt().toString() : "",
                c.createdAt().toString());
    }

    private List<String> messageToRow(Message msg) {
        String topicIdStr = "";
        if (msg.topic() != null && !msg.topic().isEmpty()) {
            var topic = topicReader.find(msg.channelId(), msg.topic());
            topicIdStr = topic.map(t -> String.valueOf(t.id())).orElse("");
        }
        String artefactRefsJson = "[]";
        if (msg.artefactRefs() != null && !msg.artefactRefs().isEmpty()) {
            artefactRefsJson = toJson(msg.artefactRefs());
        }
        var row = new ArrayList<String>(12);
        row.add(msg.channelId().toString());
        row.add(String.valueOf(msg.id()));
        row.add(msg.inReplyTo() != null ? String.valueOf(msg.inReplyTo()) : null);
        row.add(msg.sender());
        row.add(msg.content());
        row.add(msg.createdAt().toString());
        row.add(msg.messageType().name());
        row.add(msg.actorType().name());
        row.add(topicIdStr);
        row.add(msg.correlationId());
        row.add(artefactRefsJson);
        row.add(msg.target());
        return row;
    }

    private void broadcast(String json) {
        connections.forEach(c -> c.sendText(json).subscribe().with(
                ignored -> {},
                err -> Log.warnf("WebSocket send failed: %s", err.getMessage())));
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("JSON serialisation failed", e);
        }
    }
}
