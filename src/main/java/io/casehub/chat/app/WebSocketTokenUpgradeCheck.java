package io.casehub.chat.app;

import io.quarkus.websockets.next.HttpUpgradeCheck;
import io.smallrye.jwt.auth.principal.JWTParser;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class WebSocketTokenUpgradeCheck implements HttpUpgradeCheck {

    @Inject
    JWTParser jwtParser;

    @Override
    public Uni<CheckResult> perform(final HttpUpgradeContext ctx) {
        final String token = ctx.httpRequest().getParam("token");
        if (token == null || token.isBlank()) {
            return CheckResult.rejectUpgrade(401);
        }
        try {
            jwtParser.parse(token);
            return CheckResult.permitUpgrade();
        } catch (final Exception e) {
            return CheckResult.rejectUpgrade(401);
        }
    }
}
