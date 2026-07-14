package io.casehub.chat.app;

import jakarta.inject.Inject;

import io.quarkus.logging.Log;
import io.quarkus.websockets.next.OnClose;
import io.quarkus.websockets.next.OnOpen;
import io.quarkus.websockets.next.OnTextMessage;
import io.quarkus.websockets.next.WebSocket;
import io.quarkus.websockets.next.WebSocketConnection;

@WebSocket(path = "/ws/chat")
public class ChatWebSocket {

    @Inject
    ChatWebSocketBroadcaster broadcaster;

    @OnOpen
    public String onOpen(final WebSocketConnection connection) {
        broadcaster.addConnection(connection);
        return broadcaster.buildSnapshot();
    }

    @OnTextMessage
    public void onMessage(final String message) {
        Log.debugf("WebSocket client message (ignored): %s", message);
    }

    @OnClose
    public void onClose(final WebSocketConnection connection) {
        broadcaster.removeConnection(connection);
    }
}
