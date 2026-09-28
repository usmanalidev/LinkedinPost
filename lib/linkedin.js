import { linkedInVersion, requireLinkedInApp } from "./config";
import { canPersistTokens, readTokens, saveTokens } from "./tokenStore";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
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

async function createPost(ctx, text, visibility) {
  return linkedInFetch(POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": linkedInVersion(),
    },
    body: JSON.stringify({
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
    }),
  });
}

export async function publishTextPost({ text, visibility }) {
  let ctx = await getAccessContext();
  let response = await createPost(ctx, text, visibility);

  if (response.status === 401 && ctx.refreshToken && canPersistTokens()) {
    ctx = await refreshSaved(ctx);
    response = await createPost(ctx, text, visibility);
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
