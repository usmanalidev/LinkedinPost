import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

const BLOB_PATH = "linkedin/tokens.json";
const LOCAL_PATH = path.join(process.cwd(), ".data", "tokens.json");

export function storageKind() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (!process.env.VERCEL) return "file";
  if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_URN) return "env";
  return "none";
}

export function canPersistTokens() {
  const kind = storageKind();
  return kind === "blob" || kind === "file";
}

function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.accessToken !== "string" || typeof raw.personUrn !== "string") return null;
  return {
    accessToken: raw.accessToken,
    refreshToken: typeof raw.refreshToken === "string" ? raw.refreshToken : null,
    expiresAt: typeof raw.expiresAt === "number" ? raw.expiresAt : null,
    refreshExpiresAt: typeof raw.refreshExpiresAt === "number" ? raw.refreshExpiresAt : null,
    personUrn: raw.personUrn,
    name: typeof raw.name === "string" ? raw.name : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

async function readBlob() {
  const { get } = await import("@vercel/blob");
  const result = await get(BLOB_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return normalize(JSON.parse(text));
}

async function writeBlob(tokens) {
  const { put } = await import("@vercel/blob");
  await put(BLOB_PATH, JSON.stringify(tokens), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function deleteBlob() {
  const { del } = await import("@vercel/blob");
  try {
    await del(BLOB_PATH);
  } catch (error) {
    if (error?.name === "BlobNotFoundError") return;
    throw error;
  }
}

async function readLocal() {
  try {
    const text = await readFile(LOCAL_PATH, "utf8");
    return normalize(JSON.parse(text));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocal(tokens) {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

async function deleteLocal() {
  try {
    await unlink(LOCAL_PATH);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function readEnv() {
  if (!process.env.LINKEDIN_ACCESS_TOKEN || !process.env.LINKEDIN_PERSON_URN) return null;
  const expiresAt = Number(process.env.LINKEDIN_TOKEN_EXPIRES_AT);
  return normalize({
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    refreshToken: process.env.LINKEDIN_REFRESH_TOKEN || null,
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null,
    personUrn: process.env.LINKEDIN_PERSON_URN,
    name: process.env.LINKEDIN_MEMBER_NAME || null,
  });
}

export async function readTokens() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const saved = await readBlob();
    if (saved) return { ...saved, storage: "blob" };
  }

  if (!process.env.VERCEL) {
    const saved = await readLocal();
    if (saved) return { ...saved, storage: "file" };
  }

  const fromEnv = readEnv();
  if (fromEnv) return { ...fromEnv, storage: "env" };
  return null;
}

export async function saveTokens(tokens) {
  const clean = normalize({ ...tokens, updatedAt: new Date().toISOString() });
  if (!clean) throw new Error("Refusing to save an incomplete LinkedIn token.");

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await writeBlob(clean);
    return { ...clean, storage: "blob" };
  }

  if (!process.env.VERCEL) {
    await writeLocal(clean);
    return { ...clean, storage: "file" };
  }

  const error = new Error("NO_STORE");
  error.code = "NO_STORE";
  error.tokens = clean;
  throw error;
}

export async function deleteTokens() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await deleteBlob();
    return;
  }

  if (!process.env.VERCEL) {
    await deleteLocal();
    return;
  }

  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    const error = new Error(
      "Tokens are stored in environment variables. Remove LINKEDIN_ACCESS_TOKEN, LINKEDIN_REFRESH_TOKEN, and LINKEDIN_PERSON_URN, then redeploy."
    );
    error.status = 409;
    throw error;
  }
}
