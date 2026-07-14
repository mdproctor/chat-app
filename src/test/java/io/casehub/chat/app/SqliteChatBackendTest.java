package io.casehub.chat.app;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.io.TempDir;

import io.casehub.connectors.chat.ref.ChatBackend;
import io.casehub.connectors.chat.ref.ChatBackendContract;

class SqliteChatBackendTest extends ChatBackendContract {

    @TempDir
    Path tempDir;

    private SqliteChatBackend backend;

    @Override
    protected ChatBackend createBackend() {
        final String path = tempDir.resolve("test-" + System.nanoTime() + ".db").toString();
        backend = new SqliteChatBackend(path);
        return backend;
    }

    @AfterEach
    void tearDown() {
        if (backend != null) {
            backend.close();
        }
    }
}
