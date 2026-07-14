const SESSION_KEY = "pages-dev-auth-token";

export function getToken(): string | null {
    try {
        return sessionStorage.getItem(SESSION_KEY);
    } catch {
        return null;
    }
}

function isExpired(token: string): boolean {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return true;
        const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
        return typeof payload.exp !== "number" || payload.exp < Date.now() / 1000;
    } catch {
        return true;
    }
}

export function getValidToken(): string | null {
    const token = getToken();
    if (!token || isExpired(token)) return null;
    return token;
}

export function getIdentity(): string | null {
    const token = getToken();
    if (!token) return null;
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
        return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
        return null;
    }
}

export async function authenticatedFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = getToken();
    const headers = new Headers(init?.headers);
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    const resp = await fetch(url, { ...init, headers });
    if (resp.status === 401) {
        document.dispatchEvent(new CustomEvent("pages-auth-expired"));
    }
    return resp;
}

export class ChatDemoLogin extends HTMLElement {
    connectedCallback() {
        this.attachShadow({ mode: "open" });
        document.addEventListener("pages-auth-expired", this._handleExpired);
        if (getValidToken()) {
            this._dismiss();
        } else {
            this._render();
        }
    }

    disconnectedCallback() {
        document.removeEventListener("pages-auth-expired", this._handleExpired);
    }

    private _handleExpired = () => {
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* */ }
        this._render();
    };

    private _dismiss() {
        if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    }

    private _render() {
        if (!this.shadowRoot) return;
        const identities = (this.getAttribute("identities") ?? "").split(",").filter(Boolean);

        this.shadowRoot.innerHTML = `
      <style>
        .overlay {
          position: fixed; inset: 0;
          background: oklch(0% 0 0 / 0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 10000;
        }
        .dialog {
          background: white; padding: 2rem; border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          min-width: 300px; font-family: system-ui, sans-serif;
        }
        .dialog h2 { margin: 0 0 1rem; font-weight: 600; }
        .dialog input {
          width: 100%; padding: 0.5rem; margin-bottom: 1rem;
          box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px;
          font-size: 1rem;
        }
        .dialog button {
          width: 100%; padding: 0.5rem 1rem;
          background: #007bff; color: white; border: none; border-radius: 4px;
          cursor: pointer; font-size: 1rem;
        }
        .dialog button:hover { background: #0056b3; }
      </style>
      <div class="overlay">
        <div class="dialog">
          <h2>Login</h2>
          <input id="name" type="text" list="identities" placeholder="Choose or type a name" autocomplete="off" />
          <datalist id="identities">
            ${identities.map(n => `<option value="${n.trim()}">`).join("")}
          </datalist>
          <button id="login-btn">Login</button>
        </div>
      </div>`;

        const input = this.shadowRoot.querySelector("#name") as HTMLInputElement;
        const btn = this.shadowRoot.querySelector("#login-btn")!;

        const doLogin = () => { if (input.value.trim()) this._login(input.value.trim()); };
        btn.addEventListener("click", doLogin);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
        input.focus();
    }

    private async _login(name: string) {
        try {
            const resp = await fetch("/dev/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (!resp.ok) return;
            const data = (await resp.json()) as { token: string };
            sessionStorage.setItem(SESSION_KEY, data.token);
            document.dispatchEvent(new CustomEvent("pages-auth-success", {
                bubbles: true, detail: { name },
            }));
            this._dismiss();
        } catch { /* network error */ }
    }
}

customElements.define("chat-demo-login", ChatDemoLogin);
