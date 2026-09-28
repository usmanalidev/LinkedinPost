import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { canPersistTokens } from "./tokenStore";

const BLOB_PATH = "linkedin/history.json";
const LOCAL_PATH = path.join(process.cwd(), ".data", "history.json");
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const HISTORY_PAGE_SIZE = 5;

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

export function retainRecent(items, now = Date.now()) {
  const earliest = now - RETENTION_MS;
  return items.filter((item) => {
    const time = Date.parse(item.createdAt);
    return Number.isFinite(time) && time >= earliest;
  });
}

export function queryHistory(items, { from = null, to = null, page = 1 } = {}) {
  const filtered = items.filter((item) => {
    const time = Date.parse(item.createdAt);
    if (!Number.isFinite(time)) return false;
    if (from !== null && time < from) return false;
    if (to !== null && time > to) return false;
    return true;
  });
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / HISTORY_PAGE_SIZE);
  const current = totalPages === 0 ? 1 : Math.min(Math.max(page, 1), totalPages);
  const start = (current - 1) * HISTORY_PAGE_SIZE;
  return {
    posts: filtered.slice(start, start + HISTORY_PAGE_SIZE),
    page: current,
    pageSize: HISTORY_PAGE_SIZE,
    total,
    totalPages,
  };
}

async function storedHistory() {
  if (!canPersistTokens()) return { items: [], persist: null };
  if (process.env.BLOB_READ_WRITE_TOKEN) return { items: await readBlob(), persist: writeBlob };
  return { items: await readLocal(), persist: writeLocal };
}

export async function listHistory() {
  const { items, persist } = await storedHistory();
  const recent = retainRecent(items);
  if (persist && recent.length !== items.length) await persist(recent);
  return recent;
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
  const items = [item, ...(await listHistory())];

  if (process.env.BLOB_READ_WRITE_TOKEN) await writeBlob(items);
  else await writeLocal(items);

  return item;
}
