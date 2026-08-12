package io.casehub.chat.app;

import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.PushMessage;
import io.casehub.qhorus.api.channel.Channel;
import io.casehub.qhorus.api.channel.ChannelMembership;
import io.casehub.qhorus.api.channel.PresenceStatus;
import io.casehub.qhorus.api.gateway.ChannelRef;
import io.casehub.qhorus.api.gateway.OutboundMessage;
import io.casehub.qhorus.api.message.Commitment;
import io.casehub.qhorus.api.message.Topic;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class ChatWebSocketBroadcaster {

    @Inject ChatDatasetBuilder datasetBuilder;
    @Inject EventBroadcaster eventBroadcaster;



    void pushMessage(ChannelRef channel, OutboundMessage message) {
        var row = datasetBuilder.outboundMessageToRow(channel, message);
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_MESSAGES,
            PushMessage.append("messages", ChatDatasetBuilder.MESSAGE_COLUMNS, List.of(row)));
    }

    void broadcastChannelAppend(Channel channel) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_CHANNELS,
            PushMessage.append("channels", ChatDatasetBuilder.CHANNEL_COLUMNS,
                List.of(List.of(channel.id().toString(), channel.name(), "",
                    channel.description() != null ? channel.description() : "", "false"))));
    }

    void broadcastChannelRemove(UUID channelId) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_CHANNELS,
            PushMessage.remove("channels", channelId.toString()));
    }

    void broadcastPresenceReplace(String memberId, PresenceStatus status) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_PRESENCE,
            PushMessage.replace("presence", ChatDatasetBuilder.PRESENCE_COLUMNS, memberId,
                List.of(memberId, status.name(), Instant.now().toString())));
    }

    void broadcastMemberAppend(UUID channelId, ChannelMembership membership) {
        String membershipId = channelId.toString() + ":" + membership.memberId();
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_MEMBERS,
            PushMessage.append("members", ChatDatasetBuilder.MEMBER_COLUMNS,
                List.of(List.of(membershipId, channelId.toString(),
                    membership.memberId(), membership.memberId(), membership.role().name()))));
    }

    void broadcastMemberRemove(UUID channelId, String memberId) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_MEMBERS,
            PushMessage.remove("members", channelId.toString() + ":" + memberId));
    }

    void broadcastReactionAppend(Long messageId, String emoji) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_REACTIONS,
            PushMessage.append("reactions", ChatDatasetBuilder.REACTION_COLUMNS,
                List.of(List.of(String.valueOf(messageId), emoji))));
    }

    void broadcastReactionRemove(Long messageId, String emoji) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_REACTIONS,
            PushMessage.remove("reactions", String.valueOf(messageId) + ":" + emoji));
    }

    void broadcastCommitment(Commitment commitment) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_COMMITMENTS,
            PushMessage.replace("commitments", ChatDatasetBuilder.COMMITMENT_COLUMNS,
                commitment.correlationId(), datasetBuilder.commitmentToRow(commitment)));
    }

    void broadcastCommitmentAppend(Commitment commitment) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_COMMITMENTS,
            PushMessage.append("commitments", ChatDatasetBuilder.COMMITMENT_COLUMNS,
                List.of(datasetBuilder.commitmentToRow(commitment))));
    }

    void broadcastTopicAppend(UUID channelId, Topic topic) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_TOPICS,
            PushMessage.append("topics", ChatDatasetBuilder.TOPIC_COLUMNS,
                List.of(datasetBuilder.topicToRow(channelId, topic))));
    }

    void broadcastTopicReplace(UUID channelId, Topic topic) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_TOPICS,
            PushMessage.replace("topics", ChatDatasetBuilder.TOPIC_COLUMNS,
                String.valueOf(topic.id()), datasetBuilder.topicToRow(channelId, topic)));
    }

    void broadcastTopicRemove(UUID channelId, Long topicId) {
        eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_TOPICS,
            PushMessage.remove("topics", String.valueOf(topicId)));
    }
}
