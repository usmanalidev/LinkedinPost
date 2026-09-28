import { NextResponse } from "next/server";
import { isAuthorized, unauthorizedBody } from "../../../lib/apiAuth";
import { addHistoryEntry } from "../../../lib/history";
import { publishTextPost } from "../../../lib/linkedin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LENGTH = 3000;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const auth = await isAuthorized(request, body);
  if (!auth.ok) {
    const denied = unauthorizedBody(auth);
    return NextResponse.json(denied.body, { status: denied.status });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Send a JSON body with a text field." }, { status: 400 });
  }

  const text = String(body.text || "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Text is required." }, { status: 400 });
  }
  if (text.length > MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Text is longer than ${MAX_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const visibility = body.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC";
  const source = auth.via === "session" ? "site" : "bot";

  try {
    const result = await publishTextPost({ text, visibility });
    const saved = await remember({
      text,
      visibility,
      linkedinId: result.id,
      source,
      status: "posted",
    });
    return NextResponse.json({
      ok: true,
      id: result.id,
      visibility: result.visibility,
      createdAt: saved.entry?.createdAt || new Date().toISOString(),
      historySaved: saved.saved,
    });
  } catch (error) {
    const saved = await remember({
      text,
      visibility,
      source,
      status: "failed",
      error: error.message || "Post failed.",
    });
    const status = error.status || 500;
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Post failed.",
        createdAt: saved.entry?.createdAt || null,
        historySaved: saved.saved,
      },
      { status }
    );
  }
}

async function remember(entry) {
  try {
    return { saved: true, entry: await addHistoryEntry(entry) };
  } catch {
    return { saved: false, entry: null };
  }
}
