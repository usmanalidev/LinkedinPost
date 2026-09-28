"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function HomeClient() {
  const params = useSearchParams();
  const [phase, setPhase] = useState("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setBanner({ kind: "ok", text: "LinkedIn account connected." });
    if (error) setBanner({ kind: "err", text: error });
    loadStatus();
  }, [params]);

  const curl = useMemo(() => {
    const base = origin || "https://your-app.vercel.app";
    return `curl -X POST ${base}/api/post \\
  -u YOUR_USERNAME:YOUR_PASSWORD \\
  -H "Content-Type: application/json" \\
  -d "{\\"text\\":\\"Hello from the bot.\\",\\"visibility\\":\\"PUBLIC\\"}"`;
  }, [origin]);

  async function loadStatus() {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (response.status === 401) {
      setPhase("locked");
      setStatus(null);
      setPosts([]);
      return;
    }
    const body = await response.json();
    if (!response.ok) {
      setPhase("locked");
      setBanner({ kind: "err", text: body.error || "The server is not configured." });
      return;
    }
    setStatus(body);
    setPhase("ready");
    await loadHistory();
  }

  async function loadHistory() {
    const response = await fetch("/api/history", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    setPosts(Array.isArray(body.posts) ? body.posts : []);
  }

  async function unlock(event) {
    event.preventDefault();
    setBusy(true);
    setBanner(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setBanner({ kind: "err", text: body.error || "Could not sign in." });
      return;
    }
    setUsername("");
    setPassword("");
    await loadStatus();
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setStatus(null);
    setPosts([]);
    setPhase("locked");
  }

  async function disconnect() {
    setBusy(true);
    const response = await fetch("/api/auth/disconnect", { method: "POST" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setBanner({ kind: "err", text: body.error || "Could not disconnect." });
      return;
    }
    setBanner({ kind: "ok", text: "LinkedIn account disconnected." });
    await loadStatus();
  }

  async function publish(event) {
    event.preventDefault();
    setBusy(true);
    setBanner(null);
    const response = await fetch("/api/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, visibility }),
    });
    const body = await response.json();
    setBusy(false);
    await loadHistory();
    if (!response.ok) {
      setBanner({ kind: "err", text: body.error || "Post failed." });
      return;
    }
    setText("");
    setBanner({
      kind: "ok",
      text: body.id ? `Posted. LinkedIn id: ${body.id}` : "Posted.",
    });
  }

  async function copyCurl() {
    await navigator.clipboard.writeText(curl);
    setBanner({ kind: "ok", text: "Bot request copied." });
  }

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>LinkedIn Poster</h1>
          <p className="lede">
            LinkedIn credentials stay in this app. The bot signs in with a username and password, then sends the post text.
          </p>
        </div>
        {phase === "ready" ? (
          <button className="secondary" type="button" onClick={logout}>
            Sign out
          </button>
        ) : null}
      </header>

      {banner ? <div className={`banner ${banner.kind}`}>{banner.text}</div> : null}

      {phase === "checking" ? <p>Checking access…</p> : null}

      {phase === "locked" ? (
        <form className="card" onSubmit={unlock}>
          <h2>Sign in</h2>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="row">
            <button type="submit" disabled={busy || username.length === 0 || password.length === 0}>
              Continue
            </button>
          </div>
        </form>
      ) : null}

      {phase === "ready" && status ? (
        <>
          <section className="card">
            <h2>Account</h2>
            {status.connected ? (
              <>
                <p>Connected{status.name ? ` as ${status.name}` : ""}.</p>
                <p className="meta">
                  {status.personUrn}
                  {status.expiresAt ? ` · access token until ${new Date(status.expiresAt).toLocaleString()}` : ""}
                </p>
                <div className="row">
                  <a className="button" href="/api/auth/linkedin">Reconnect</a>
                  <button className="secondary" type="button" onClick={disconnect} disabled={busy}>
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>No LinkedIn account is connected yet.</p>
                {!status.canPersist ? (
                  <p className="banner warn">
                    No private Blob store is attached. After login, this server will show the tokens once so you can paste them into Vercel. Attach a Blob store if you want refresh to be saved automatically.
                  </p>
                ) : null}
                <div className="row">
                  <a className="button" href="/api/auth/linkedin">Connect LinkedIn</a>
                </div>
              </>
            )}
          </section>

          <form className="card" onSubmit={publish}>
            <h2>Post</h2>
            <label htmlFor="text">Text</label>
            <textarea
              id="text"
              value={text}
              maxLength={3000}
              onChange={(event) => setText(event.target.value)}
              placeholder="What should go on your profile?"
            />
            <div className="row">
              <label htmlFor="visibility">Visibility</label>
              <select
                id="visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value)}
              >
                <option value="PUBLIC">Anyone</option>
                <option value="CONNECTIONS">Connections</option>
              </select>
              <span className="count">{text.trim().length} / 3000</span>
            </div>
            <div className="row">
              <button type="submit" disabled={busy || text.trim().length === 0 || !status.connected}>
                Publish
              </button>
            </div>
          </form>

          <section className="card">
            <h2>History</h2>
            {posts.length === 0 ? (
              <p className="meta">No posts yet.</p>
            ) : (
              <ol className="history">
                {posts.map((post) => (
                  <li key={post.id}>
                    <div className="history-meta">
                      <time dateTime={post.createdAt}>{formatWhen(post.createdAt)}</time>
                      <span>{post.status === "posted" ? "Posted" : "Failed"}</span>
                      <span>{post.visibility === "CONNECTIONS" ? "Connections" : "Anyone"}</span>
                      <span>{post.source === "bot" ? "Bot" : "Site"}</span>
                    </div>
                    <p>{post.text}</p>
                    {post.linkedinId ? <p className="meta">{post.linkedinId}</p> : null}
                    {post.error ? <p className="meta">{post.error}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card">
            <h2>Bot endpoint</h2>
            <p>
              Keep <code>LINKEDIN_CLIENT_ID</code> and <code>LINKEDIN_CLIENT_SECRET</code> in the server environment.
              Give the bot only the username and password from <code>AUTH_USERNAME</code> and <code>AUTH_PASSWORD</code>.
            </p>
            <p>
              <code>POST {origin || ""}/api/post</code>
            </p>
            <pre>{curl}</pre>
            <div className="row">
              <button className="secondary" type="button" onClick={copyCurl}>
                Copy request
              </button>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
