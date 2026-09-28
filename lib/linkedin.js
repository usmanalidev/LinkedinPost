import { linkedInVersion, requireLinkedInApp } from "./config";
import { canPersistTokens, readTokens, saveTokens } from "./tokenStore";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const IMAGES_URL = "https://api.linkedin.com/rest/images";
const DOCUMENTS_URL = "https://api.linkedin.com/rest/documents";
const MAX_IMAGES = 6;
const POLL_DURATIONS = new Set(["ONE_DAY", "THREE_DAYS", "SEVEN_DAYS", "FOURTEEN_DAYS"]);
const SCOPES = "openid profile w_member_social";
const EXPIRY_SKEW_MS = 2 * 60 * 1000;

export function buildAuthorizationUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES);
  return url;
}

async function linkedInFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const detail = error?.cause?.message || error?.message || "Network request failed.";
    const wrapped = new Error(`Could not reach LinkedIn: ${detail}`);
    wrapped.status = 502;
    throw wrapped;
  }
}

async function tokenRequest(body) {
  const { clientId, clientSecret } = requireLinkedInApp();
  const payload = new URLSearchParams({
    ...body,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await linkedInFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
  });
  const text = await response.text();
  const json = parseJson(text);
  if (!response.ok) {
    const error = new Error(linkedInMessage(json, text) || "LinkedIn token exchange failed.");
    error.status = response.status === 401 ? 401 : 502;
    throw error;
  }
  return json;
}

export async function exchangeCode({ code, redirectUri }) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

async function refreshAccessToken(refreshToken) {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function fetchMember(accessToken, idToken) {
  const response = await linkedInFetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.ok) {
    const profile = await response.json();
    if (profile?.sub) {
      return {
        personUrn: `urn:li:person:${profile.sub}`,
        name: profile.name || null,
      };
    }
  }

  if (idToken) {
    const payload = decodeJwtPayload(idToken);
    if (payload?.sub) {
      return {
        personUrn: `urn:li:person:${payload.sub}`,
        name: payload.name || null,
      };
    }
  }

  const error = new Error("LinkedIn did not return a member id.");
  error.status = 502;
  throw error;
}

export function tokensFromOAuth(oauth, member) {
  return {
    accessToken: oauth.access_token,
    refreshToken: oauth.refresh_token || null,
    expiresAt: oauth.expires_in ? Date.now() + oauth.expires_in * 1000 : null,
    refreshExpiresAt: oauth.refresh_token_expires_in
      ? Date.now() + oauth.refresh_token_expires_in * 1000
      : null,
    personUrn: member.personUrn,
    name: member.name,
  };
}

function tokenIsFresh(saved) {
  if (!saved?.expiresAt) return true;
  return saved.expiresAt - EXPIRY_SKEW_MS > Date.now();
}

async function refreshSaved(saved) {
  if (!saved.refreshToken) {
    const error = new Error("The LinkedIn access token expired. Set a new LINKEDIN_ACCESS_TOKEN.");
    error.status = 401;
    throw error;
  }
  if (!canPersistTokens()) {
    const error = new Error(
      "The LinkedIn access token expired, and this deployment cannot store a refreshed token. Attach a private Vercel Blob store, then connect again."
    );
    error.status = 409;
    throw error;
  }

  const next = await refreshAccessToken(saved.refreshToken);
  return saveTokens({
    ...saved,
    accessToken: next.access_token,
    refreshToken: next.refresh_token || saved.refreshToken,
    expiresAt: next.expires_in ? Date.now() + next.expires_in * 1000 : saved.expiresAt,
    refreshExpiresAt: next.refresh_token_expires_in
      ? Date.now() + next.refresh_token_expires_in * 1000
      : saved.refreshExpiresAt,
  });
}

export async function getAccessContext() {
  const saved = await readTokens();
  if (!saved?.accessToken || !saved?.personUrn) {
    const error = new Error("Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN on the server.");
    error.status = 409;
    throw error;
  }
  if (tokenIsFresh(saved)) return saved;
  return refreshSaved(saved);
}

function linkedInHeaders(accessToken, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "Linkedin-Version": linkedInVersion(),
    ...extra,
  };
}

export function normalizePoll(poll) {
  if (!poll || typeof poll !== "object") return null;
  const question = String(poll.question || "").trim();
  const options = (Array.isArray(poll.options) ? poll.options : [])
    .map((option) => String(option || "").trim())
    .filter(Boolean);
  const duration = POLL_DURATIONS.has(poll.duration) ? poll.duration : "";
  if (!question && options.length === 0 && !duration) return null;
  if (question.length < 1 || question.length > 140) {
    const error = new Error("The poll question must be 1–140 characters.");
    error.status = 400;
    throw error;
  }
  if (options.length < 2 || options.length > 4) {
    const error = new Error("A poll needs 2–4 options.");
    error.status = 400;
    throw error;
  }
  if (options.some((option) => option.length > 30)) {
    const error = new Error("Each poll option must be 30 characters or fewer.");
    error.status = 400;
    throw error;
  }
  if (!duration) {
    const error = new Error("Choose how long the poll stays open.");
    error.status = 400;
    throw error;
  }
  return { question, options, duration };
}

export function detectDocument(bytes, filename) {
  const name = String(filename || "");
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  const title = name.replace(/[\\/]/g, "").trim().slice(0, 200) || "Document";
  if (ext === ".pdf" && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { contentType: "application/pdf", title };
  }
  const ole = bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (ext === ".doc" && ole) return { contentType: "application/msword", title };
  if (ext === ".ppt" && ole) return { contentType: "application/vnd.ms-powerpoint", title };
  const zip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (ext === ".docx" && zip) {
    return { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", title };
  }
  if (ext === ".pptx" && zip) {
    return { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", title };
  }
  return null;
}

export function detectImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  return null;
}

async function readLinkedIn(response, fallback) {
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error(linkedInMessage(parseJson(raw), raw) || fallback);
    error.status = response.status === 401 ? 401 : 502;
    throw error;
  }
  return parseJson(raw);
}

async function registerUpload(ctx, resourceUrl, urnKey) {
  const response = await linkedInFetch(`${resourceUrl}?action=initializeUpload`, {
    method: "POST",
    headers: linkedInHeaders(ctx.accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      initializeUploadRequest: { owner: ctx.personUrn },
    }),
  });
  const init = await readLinkedIn(response, "LinkedIn did not accept the upload.");
  const uploadUrl = init?.value?.uploadUrl;
  const urn = init?.value?.[urnKey];
  if (!uploadUrl || !urn) {
    const error = new Error("LinkedIn did not return an upload URL.");
    error.status = 502;
    throw error;
  }
  return { uploadUrl, urn };
}

async function sendUpload(ctx, uploadUrl, bytes, contentType) {
  const uploadResponse = await linkedInFetch(uploadUrl, {
    method: "PUT",
    headers: linkedInHeaders(ctx.accessToken, { "Content-Type": contentType }),
    body: bytes,
  });
  if (uploadResponse.status !== 201 && uploadResponse.status !== 200) {
    await readLinkedIn(uploadResponse, "LinkedIn rejected the file.");
    return;
  }
  await uploadResponse.arrayBuffer().catch(() => null);
}

async function uploadImage(ctx, image) {
  const { uploadUrl, urn } = await registerUpload(ctx, IMAGES_URL, "image");
  await sendUpload(ctx, uploadUrl, image.bytes, image.contentType);
  return urn;
}

async function uploadDocument(ctx, document) {
  const { uploadUrl, urn } = await registerUpload(ctx, DOCUMENTS_URL, "document");
  await sendUpload(ctx, uploadUrl, document.bytes, document.contentType);
  return urn;
}

async function buildContent(ctx, { images, document, poll }) {
  if (poll) {
    return {
      poll: {
        question: poll.question,
        options: poll.options.map((option) => ({ text: option })),
        settings: { duration: poll.duration },
      },
    };
  }
  if (document) {
    return { media: { id: await uploadDocument(ctx, document), title: document.title } };
  }
  if (images.length === 1) {
    return { media: { id: await uploadImage(ctx, images[0]), altText: "Image" } };
  }
  if (images.length > 1) {
    const uploaded = [];
    for (const image of images) {
      uploaded.push({ id: await uploadImage(ctx, image), altText: "Image" });
    }
    return { multiImage: { images: uploaded } };
  }
  return null;
}

async function createPost(ctx, text, visibility, content) {
  const payload = {
    author: ctx.personUrn,
    commentary: text,
    visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (content) payload.content = content;
  return linkedInFetch(POSTS_URL, {
    method: "POST",
    headers: linkedInHeaders(ctx.accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
}

export async function publishTextPost({ text, visibility, image = null, images = [], document = null, poll = null }) {
  const files = images.length > 0 ? images : image ? [image] : [];
  const chosen = [files.length > 0, Boolean(document), Boolean(poll)].filter(Boolean).length;
  if (chosen > 1) {
    const error = new Error("Choose images, a document, or a poll.");
    error.status = 400;
    throw error;
  }
  if (files.length > MAX_IMAGES) {
    const error = new Error(`Choose up to ${MAX_IMAGES} images.`);
    error.status = 400;
    throw error;
  }

  let ctx = await getAccessContext();
  let content = await buildContent(ctx, { images: files, document, poll });
  let response = await createPost(ctx, text, visibility, content);

  if (response.status === 401 && ctx.refreshToken && canPersistTokens()) {
    ctx = await refreshSaved(ctx);
    content = await buildContent(ctx, { images: files, document, poll });
    response = await createPost(ctx, text, visibility, content);
  }

  const raw = await response.text();
  if (response.status !== 201) {
    const error = new Error(linkedInMessage(parseJson(raw), raw) || "LinkedIn rejected the post.");
    error.status = response.status === 401 ? 401 : 502;
    throw error;
  }

  return {
    id: response.headers.get("x-restli-id"),
    visibility,
  };
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function linkedInMessage(json, raw) {
  if (json && typeof json === "object") {
    return json.message || json.error_description || json.error || null;
  }
  if (!raw) return null;
  return raw.slice(0, 500);
}

function decodeJwtPayload(jwt) {
  const part = String(jwt).split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
