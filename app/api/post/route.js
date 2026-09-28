import { NextResponse } from "next/server";
import { isAuthorized, unauthorizedBody } from "../../../lib/apiAuth";
import { addHistoryEntry } from "../../../lib/history";
import { detectDocument, detectImage, normalizePoll, publishTextPost } from "../../../lib/linkedin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LENGTH = 3000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 6;

export async function POST(request) {
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("multipart/form-data")
    ? await readForm(request)
    : await request.json().catch(() => null);
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

  let images = [];
  let document = null;
  let poll = null;
  try {
    images = await readImages(body.images || body.image);
    document = await readDocument(body.document);
    poll = normalizePoll(body.poll);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status || 400 });
  }

  const visibility = body.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC";
  const source = auth.via === "session" ? "site" : "bot";
  const attachment = poll ? "poll" : document ? "document" : images.length > 1 ? "images" : images.length === 1 ? "image" : null;

  try {
    const result = await publishTextPost({ text, visibility, images, document, poll });
    const saved = await remember({
      text,
      visibility,
      linkedinId: result.id,
      source,
      status: "posted",
      attachment,
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
      attachment,
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

async function readForm(request) {
  const form = await request.formData();
  return {
    text: form.get("text"),
    visibility: form.get("visibility"),
    username: form.get("username"),
    password: form.get("password"),
    images: form.getAll("images").filter((file) => file && typeof file !== "string" && file.size > 0),
    document: form.get("document"),
    poll: {
      question: form.get("pollQuestion"),
      options: form.getAll("pollOption"),
      duration: form.get("pollDuration"),
    },
  };
}

async function readImages(value) {
  const files = (Array.isArray(value) ? value : [value]).filter(
    (file) => file && typeof file !== "string" && typeof file.arrayBuffer === "function" && file.size > 0
  );
  if (files.length > MAX_IMAGES) {
    const error = new Error(`Choose up to ${MAX_IMAGES} images.`);
    error.status = 400;
    throw error;
  }
  const images = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      const error = new Error("Each image must be 4 MB or smaller.");
      error.status = 400;
      throw error;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = detectImage(bytes);
    if (!contentType) {
      const error = new Error("Use JPG, PNG, or GIF images.");
      error.status = 400;
      throw error;
    }
    images.push({ bytes, contentType });
  }
  return images;
}

async function readDocument(file) {
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function" || file.size === 0) return null;
  if (file.size > MAX_DOCUMENT_BYTES) {
    const error = new Error("Document must be 8 MB or smaller.");
    error.status = 400;
    throw error;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectDocument(bytes, file.name);
  if (!detected) {
    const error = new Error("Use a PDF, DOC, DOCX, PPT, or PPTX file.");
    error.status = 400;
    throw error;
  }
  return { bytes, ...detected };
}

async function remember(entry) {
  try {
    return { saved: true, entry: await addHistoryEntry(entry) };
  } catch {
    return { saved: false, entry: null };
  }
}
