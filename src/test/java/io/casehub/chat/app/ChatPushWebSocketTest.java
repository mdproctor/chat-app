package io.casehub.chat.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.PushMessage;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import jakarta.websocket.ClientEndpointConfig;
import jakarta.websocket.ContainerProvider;
import jakarta.websocket.Endpoint;
import jakarta.websocket.EndpointConfig;
import jakarta.websocket.MessageHandler;
import jakarta.websocket.Session;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@QuarkusTest
class ChatPushWebSocketTest {

    @TestHTTPResource("/ws/push")
    URI wsUri;

    @Inject ObjectMapper objectMapper;
    @Inject EventBroadcaster eventBroadcaster;

    @Test
    void listenWithSinceZeroReturnsSnapshot() throws Exception {
        var future = new CompletableFuture<String>();
        try (Session session = connect(future)) {
            session.getBasicRemote().sendText(
                """
                {"op":"listen","id":"1","topics":["chat:channels"],"since":{"chat:channels":0}}""");

            String raw = future.get(5, TimeUnit.SECONDS);
            Map<String, Object> event = objectMapper.readValue(raw, new TypeReference<>() {});
            assertThat(event.get("op")).isEqualTo("event");
            assertThat(event.get("topic")).isEqualTo("chat:channels");
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = (Map<String, Object>) event.get("payload");
            assertThat(payload.get("op")).isEqualTo("snapshot");
            assertThat(payload.get("dataset")).isEqualTo("channels");
            assertThat(payload).containsKey("columns");
            assertThat(payload).containsKey("rows");
        }
    }

    @Test
    void noDataBeforeListen() throws Exception {
        var messages = new ArrayList<String>();
        var future = new CompletableFuture<Void>();
        try (Session session = connectMulti(messages, future)) {
            Thread.sleep(500);
            assertThat(messages).isEmpty();
        }
    }

    @Test
    void broadcastAfterListenDeliversEvent() throws Exception {
        var messages = new ArrayList<String>();
        var firstMsg = new CompletableFuture<Void>();
        try (Session session = connectMulti(messages, firstMsg)) {
            session.getBasicRemote().sendText(
                """
                {"op":"listen","id":"1","topics":["chat:messages"],"since":{"chat:messages":0}}""");
            firstMsg.get(5, TimeUnit.SECONDS);

            String pushJson = PushMessage.append("messages",
                ChatDatasetBuilder.MESSAGE_COLUMNS,
                List.of(List.of("ch-1", "1", "", "alice", "hello",
                    "2026-01-01T00:00:00Z", "EVENT", "HUMAN", "", "", "[]", "")));
            eventBroadcaster.broadcast(ChatDatasetBuilder.TOPIC_MESSAGES, pushJson);

            Thread.sleep(500);

            boolean foundEvent = false;
            for (int i = 1; i < messages.size(); i++) {
                String msg = messages.get(i);
                if (msg.contains("\"op\":\"event\"") && msg.contains("chat:messages")) {
                    foundEvent = true;
                    break;
                }
            }
            assertThat(foundEvent).as("should receive event after broadcast").isTrue();
        }
    }

    private String obtainToken(String name) {
        return RestAssured.given()
            .contentType("application/json")
            .body(Map.of("name", name))
            .post("/dev/auth/login")
            .then().statusCode(200)
            .extract().path("token");
    }

    private Session connect(CompletableFuture<String> future) throws Exception {
        String token = obtainToken("push-user");
        var container = ContainerProvider.getWebSocketContainer();
        var uri = new URI(wsUri.toString().replace("http://", "ws://") + "?token=" + token);
        return container.connectToServer(new Endpoint() {
            @Override
            public void onOpen(Session session, EndpointConfig config) {
                session.addMessageHandler(new MessageHandler.Whole<String>() {
                    @Override
                    public void onMessage(String message) {
                        future.complete(message);
                    }
                });
            }
        }, ClientEndpointConfig.Builder.create().build(), uri);
    }

    private Session connectMulti(List<String> messages, CompletableFuture<Void> firstMsg) throws Exception {
        String token = obtainToken("push-user");
        var container = ContainerProvider.getWebSocketContainer();
        var uri = new URI(wsUri.toString().replace("http://", "ws://") + "?token=" + token);
        return container.connectToServer(new Endpoint() {
            @Override
            public void onOpen(Session session, EndpointConfig config) {
                session.addMessageHandler(new MessageHandler.Whole<String>() {
                    @Override
                    public void onMessage(String message) {
                        messages.add(message);
                        if (!firstMsg.isDone()) firstMsg.complete(null);
                    }
                });
            }
        }, ClientEndpointConfig.Builder.create().build(), uri);
    }
}
