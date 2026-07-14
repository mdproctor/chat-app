import { describe, it, expect, vi, beforeEach } from "vitest";
import { getToken, getValidToken, getIdentity, authenticatedFetch } from "./auth.js";

function createMockJwt(sub: string, exp?: number): string {
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub, exp: exp ?? (Date.now() / 1000 + 3600) }));
    return `${header}.${payload}.fake-signature`;
}

describe("auth", () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it("getToken returns null when no token stored", () => {
        expect(getToken()).toBeNull();
    });

    it("getToken returns stored token", () => {
        sessionStorage.setItem("pages-dev-auth-token", "my-token");
        expect(getToken()).toBe("my-token");
    });

    it("getIdentity returns sub from JWT", () => {
        sessionStorage.setItem("pages-dev-auth-token", createMockJwt("alice"));
        expect(getIdentity()).toBe("alice");
    });

    it("getIdentity returns null when no token", () => {
        expect(getIdentity()).toBeNull();
    });

    it("getValidToken returns null for expired token", () => {
        sessionStorage.setItem("pages-dev-auth-token", createMockJwt("alice", Date.now() / 1000 - 60));
        expect(getValidToken()).toBeNull();
    });

    it("getValidToken returns token when not expired", () => {
        const token = createMockJwt("alice");
        sessionStorage.setItem("pages-dev-auth-token", token);
        expect(getValidToken()).toBe(token);
    });

    it("authenticatedFetch adds Authorization header", async () => {
        sessionStorage.setItem("pages-dev-auth-token", "my-token");
        globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

        await authenticatedFetch("/api/test");

        expect(globalThis.fetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({
            headers: expect.any(Headers),
        }));
        const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
        const headers = call[1].headers as Headers;
        expect(headers.get("Authorization")).toBe("Bearer my-token");
    });

    it("authenticatedFetch dispatches pages-auth-expired on 401", async () => {
        sessionStorage.setItem("pages-dev-auth-token", "my-token");
        globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));

        const expiredPromise = new Promise<void>((resolve) => {
            document.addEventListener("pages-auth-expired", () => resolve(), { once: true });
        });

        await authenticatedFetch("/api/test");
        await expiredPromise;
    });
});
