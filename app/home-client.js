"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function HomeClient() {
  const [phase, setPhase] = useState("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [posts, setPosts] = useState([]);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPages, setHistoryPages] = useState(0);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [extra, setExtra] = useState("none");
  const [imageFiles, setImageFiles] = useState([]);
  const [documentFile, setDocumentFile] = useState(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState("SEVEN_DAYS");
  const imageInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    loadStatus();
  }, []);

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
      setHistoryTotal(0);
      setHistoryPages(0);
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

  async function loadHistory({ page = 1, from = historyFrom, to = historyTo } = {}) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    const start = rangeStart(from);
    const end = rangeEnd(to);
    if (from && !start) {
      setBanner({ kind: "err", text: "The start time is not valid." });
      return;
    }
    if (to && !end) {
      setBanner({ kind: "err", text: "The end time is not valid." });
      return;
    }
    if (start) params.set("from", start);
    if (end) params.set("to", end);
    const response = await fetch(`/api/history?${params}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setBanner({ kind: "err", text: body?.error || "Could not load history." });
      return;
    }
    setPosts(Array.isArray(body.posts) ? body.posts : []);
    setHistoryPage(body.page || 1);
    setHistoryTotal(body.total || 0);
    setHistoryPages(body.totalPages || 0);
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
    setHistoryTotal(0);
    setHistoryPages(0);
    setPhase("locked");
  }

  function searchHistory(event) {
    event.preventDefault();
    loadHistory({ page: 1, from: historyFrom, to: historyTo });
  }

  function clearHistorySearch() {
    setHistoryFrom("");
    setHistoryTo("");
    loadHistory({ page: 1, from: "", to: "" });
  }

  function clearImages() {
    imageFiles.forEach((item) => URL.revokeObjectURL(item.url));
    setImageFiles([]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function chooseImages(event) {
    imageFiles.forEach((item) => URL.revokeObjectURL(item.url));
    const files = Array.from(event.target.files || []).slice(0, 6);
    setImageFiles(files.map((file) => ({ file, url: URL.createObjectURL(file) })));
  }

  function clearDocument() {
    setDocumentFile(null);
    if (documentInputRef.current) documentInputRef.current.value = "";
  }

  function changeExtra(value) {
    setExtra(value);
    if (value !== "images") clearImages();
    if (value !== "document") clearDocument();
  }

  function updateOption(index, value) {
    setPollOptions((current) => current.map((option, item) => (item === index ? value : option)));
  }

  async function publish(event) {
    event.preventDefault();
    setBusy(true);
    setBanner(null);
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    let response;
    if (extra === "images" || extra === "document") {
      const form = new FormData();
      form.set("text", text);
      form.set("visibility", visibility);
      if (extra === "images") imageFiles.forEach((item) => form.append("images", item.file));
      if (extra === "document" && documentFile) form.set("document", documentFile);
      response = await fetch("/api/post", { method: "POST", body: form });
    } else {
      response = await fetch("/api/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          visibility,
          poll: extra === "poll" ? { question: pollQuestion.trim(), options, duration: pollDuration } : undefined,
        }),
      });
    }
    const body = await response.json();
    setBusy(false);
    await loadHistory();
    if (!response.ok) {
      setBanner({ kind: "err", text: body.error || "Post failed." });
      return;
    }
    setText("");
    setPollQuestion("");
    setPollOptions(["", ""]);
    clearImages();
    clearDocument();
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
            Posts use the LinkedIn access token stored on this server. The bot signs in with a username and password, then sends the post text.
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
            <h2>Access token</h2>
            {status.connected ? (
              <>
                <p>Ready to post{status.name ? ` as ${status.name}` : ""}.</p>
                <p className="meta">
                  {status.personUrn || "Member id is set."}
                  {status.expiresAt
                    ? ` · token until ${new Date(status.expiresAt).toLocaleString()}`
                    : " · token is read from the server environment"}
                </p>
              </>
            ) : (
              <>
                <p>No access token is configured.</p>
                <p className="meta">
                  Set <code>LINKEDIN_ACCESS_TOKEN</code> and <code>LINKEDIN_PERSON_URN</code> on the server, then restart.
                </p>
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
            <div className="field">
              <label htmlFor="extra">Add</label>
              <select id="extra" value={extra} onChange={(event) => changeExtra(event.target.value)}>
                <option value="none">Text only</option>
                <option value="images">Images</option>
                <option value="document">Document</option>
                <option value="poll">Poll</option>
              </select>
            </div>
            {extra === "images" ? (
              <div className="field">
                <label htmlFor="image">Images</label>
                <input
                  id="image"
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif"
                  multiple
                  onChange={chooseImages}
                />
                <p className="meta">Up to 6 JPG, PNG, or GIF files. Each file can be 4 MB. Two or more become one gallery.</p>
                {imageFiles.length > 0 ? (
                  <div className="previews">
                    {imageFiles.map((item) => (
                      <img key={item.url} src={item.url} alt="" />
                    ))}
                    <button className="secondary" type="button" onClick={clearImages}>
                      Remove images
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {extra === "document" ? (
              <div className="field">
                <label htmlFor="document">Document</label>
                <input
                  id="document"
                  ref={documentInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
                />
                <p className="meta">PDF, DOC, DOCX, PPT, or PPTX, up to 8 MB.{documentFile ? ` ${documentFile.name}` : ""}</p>
              </div>
            ) : null}
            {extra === "poll" ? (
              <div className="field">
                <label htmlFor="poll-question">Poll question</label>
                <input
                  id="poll-question"
                  maxLength={140}
                  value={pollQuestion}
                  onChange={(event) => setPollQuestion(event.target.value)}
                />
                {pollOptions.map((option, index) => (
                  <div className="field" key={index}>
                    <label htmlFor={`poll-option-${index}`}>Option {index + 1}</label>
                    <input
                      id={`poll-option-${index}`}
                      maxLength={30}
                      value={option}
                      onChange={(event) => updateOption(index, event.target.value)}
                    />
                  </div>
                ))}
                <div className="row">
                  <button
                    className="secondary"
                    type="button"
                    disabled={pollOptions.length >= 4}
                    onClick={() => setPollOptions((current) => [...current, ""])}
                  >
                    Add option
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={pollOptions.length <= 2}
                    onClick={() => setPollOptions((current) => current.slice(0, -1))}
                  >
                    Remove option
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="poll-duration">Open for</label>
                  <select
                    id="poll-duration"
                    value={pollDuration}
                    onChange={(event) => setPollDuration(event.target.value)}
                  >
                    <option value="ONE_DAY">1 day</option>
                    <option value="THREE_DAYS">3 days</option>
                    <option value="SEVEN_DAYS">7 days</option>
                    <option value="FOURTEEN_DAYS">14 days</option>
                  </select>
                </div>
              </div>
            ) : null}
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
              <button type="submit" disabled={busy || !canPublish(text, extra, imageFiles, documentFile, pollQuestion, pollOptions) || !status.connected}>
                Publish
              </button>
            </div>
          </form>

          <section className="card">
            <h2>History</h2>
            <p className="meta">The last 7 days. Search by the time a post was attempted.</p>
            <p className="meta">
              Comments and replies are added on LinkedIn. Open a posted item there. This app can publish, and LinkedIn does not allow this token to read or write comments.
            </p>
            <form className="filters" onSubmit={searchHistory}>
              <div className="field">
                <label htmlFor="history-from">From</label>
                <input
                  id="history-from"
                  type="datetime-local"
                  value={historyFrom}
                  onChange={(event) => setHistoryFrom(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="history-to">To</label>
                <input
                  id="history-to"
                  type="datetime-local"
                  value={historyTo}
                  onChange={(event) => setHistoryTo(event.target.value)}
                />
              </div>
              <div className="row">
                <button type="submit">Search</button>
                <button className="secondary" type="button" onClick={clearHistorySearch}>
                  Clear
                </button>
                <span className="count">
                  {historyTotal === 0 ? "0 posts" : `${historyTotal} post${historyTotal === 1 ? "" : "s"}`}
                </span>
              </div>
            </form>
            {posts.length === 0 ? (
              <p className="meta">No posts in this range.</p>
            ) : (
              <ol className="history">
                {posts.map((post) => (
                  <li key={post.id}>
                    <div className="history-meta">
                      <time dateTime={post.createdAt}>{formatWhen(post.createdAt)}</time>
                      <span>{post.status === "posted" ? "Posted" : "Failed"}</span>
                      <span>{post.visibility === "CONNECTIONS" ? "Connections" : "Anyone"}</span>
                      <span>{post.source === "bot" ? "Bot" : "Site"}</span>
                      {attachmentLabel(post.attachment) ? <span>{attachmentLabel(post.attachment)}</span> : null}
                    </div>
                    <p>{post.text}</p>
                    {post.linkedinId ? (
                      <p className="meta">
                        <a href={`https://www.linkedin.com/feed/update/${post.linkedinId}`} target="_blank" rel="noreferrer">
                          Open on LinkedIn to comment or reply
                        </a>
                      </p>
                    ) : null}
                    {post.error ? <p className="meta">{post.error}</p> : null}
                  </li>
                ))}
              </ol>
            )}
            {historyTotal > 0 ? (
              <div className="pager">
                <button
                  className="secondary"
                  type="button"
                  disabled={historyPage <= 1}
                  onClick={() => loadHistory({ page: historyPage - 1 })}
                >
                  Previous
                </button>
                <span>
                  Page {historyPage} of {historyPages}
                </span>
                <button
                  className="secondary"
                  type="button"
                  disabled={historyPage >= historyPages}
                  onClick={() => loadHistory({ page: historyPage + 1 })}
                >
                  Next
                </button>
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>Bot endpoint</h2>
            <p>
              Keep <code>LINKEDIN_ACCESS_TOKEN</code> and <code>LINKEDIN_PERSON_URN</code> in the server environment.
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

function canPublish(text, extra, imageFiles, documentFile, pollQuestion, pollOptions) {
  if (text.trim().length === 0) return false;
  if (extra === "images") return imageFiles.length > 0;
  if (extra === "document") return Boolean(documentFile);
  if (extra === "poll") {
    return pollQuestion.trim().length > 0 && pollOptions.map((option) => option.trim()).filter(Boolean).length >= 2;
  }
  return true;
}

function attachmentLabel(attachment) {
  if (attachment === "image") return "Image";
  if (attachment === "images") return "Images";
  if (attachment === "document") return "Document";
  if (attachment === "poll") return "Poll";
  return "";
}

function rangeStart(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function rangeEnd(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setSeconds(59, 999);
  return date.toISOString();
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
