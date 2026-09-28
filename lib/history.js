import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { canPersistTokens } from "./tokenStore";

const BLOB_PATH = "linkedin/history.json";
const LOCAL_PATH = path.join(process.cwd(), ".data", "history.json");
const MAX_ITEMS = 100;

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || typeof raw.createdAt !== "string" || typeof raw.text !== "string") return null;
  return {
    id: raw.id,
    createdAt: raw.createdAt,
    text: raw.text,
    visibility: raw.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC",
    linkedinId: typeof raw.linkedinId === "string" ? raw.linkedinId : null,
    source: raw.source === "bot" ? "bot" : "site",
    status: raw.status === "failed" ? "failed" : "posted",
    error: typeof raw.error === "string" ? raw.error : null,
  };
}

function normalizeList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeItem).filter(Boolean);
}

async function readBlob() {
  const { get } = await import("@vercel/blob");
  const result = await get(BLOB_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return [];
  return normalizeList(JSON.parse(await new Response(result.stream).text()));
}

async function writeBlob(items) {
  const { put } = await import("@vercel/blob");
  await put(BLOB_PATH, JSON.stringify(items), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readLocal() {
  try {
    return normalizeList(JSON.parse(await readFile(LOCAL_PATH, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocal(items) {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(items, null, 2), "utf8");
}

export async function listHistory() {
  if (!canPersistTokens()) return [];
  if (process.env.BLOB_READ_WRITE_TOKEN) return readBlob();
  return readLocal();
}

export async function addHistoryEntry(entry) {
  if (!canPersistTokens()) {
    const error = new Error("Post history cannot be stored until a private Blob store is attached.");
    error.code = "NO_HISTORY_STORE";
    throw error;
  }

  const item = normalizeItem({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    text: entry.text,
    visibility: entry.visibility,
    linkedinId: entry.linkedinId || null,
    source: entry.source,
    status: entry.status,
    error: entry.error || null,
  });
  const items = [item, ...(await listHistory())].slice(0, MAX_ITEMS);

  if (process.env.BLOB_READ_WRITE_TOKEN) await writeBlob(items);
  else await writeLocal(items);

  return item;
}
