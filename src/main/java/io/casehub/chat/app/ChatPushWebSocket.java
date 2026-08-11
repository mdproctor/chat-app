package io.casehub.chat.app;

import io.casehub.pages.push.EventStore;
import io.casehub.pages.push.PushMessage;
import io.casehub.pages.push.PushRequest;
import io.casehub.pages.push.TopicRegistry;
import io.quarkus.logging.Log;
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
                        sendText(connection, PushMessage.event(topic, datasetBuilder.buildSnapshot(topic)));
                    } else {
                        var events = eventStore.replay(topic, since, 10000);
                        if (!events.isEmpty() && events.get(0).seq() > since + 1) {
                            sendText(connection, PushMessage.event(topic, datasetBuilder.buildSnapshot(topic)));
                        } else {
                            for (var event : events) {
                                sendText(connection, PushMessage.event(topic, event.payloadJson(), event.seq()));
                            }
                        }
                    }
                }
            }
            case PushRequest.Unlisten unlisten ->
                topicRegistry.unlisten(connection.id(), unlisten.topics());
            default -> Log.debugf("Ignoring push request: %s", request.op());
        }
    }

    @OnClose
    void onClose(WebSocketConnection connection) {
        pushInfra.removeConnection(connection.id());
    }

    private void sendText(WebSocketConnection connection, String text) {
        connection.sendText(text).subscribe().with(
            ignored -> {},
            err -> Log.warnf("Push send failed: %s", err.getMessage()));
    }
}
