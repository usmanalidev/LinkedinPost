import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "lp_session";

export const CONFIG_ERROR =
  "Set AUTH_USERNAME and AUTH_PASSWORD on the server. Use a password of at least 8 characters.";

export function getLogin() {
  const username = (process.env.AUTH_USERNAME || "").trim();
  const password = process.env.AUTH_PASSWORD || "";
  if (username.length < 3 || password.length < 8) return null;
  return { username, password };
}

export function sessionValue(username, password) {
  return createHmac("sha256", password).update(`linkedin-poster-v2:${username}`).digest("hex");
}

export function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue));
  const right = Buffer.from(String(rightValue));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function matchesLogin(username, password) {
  const login = getLogin();
  if (!login) return false;
  return safeEqual(String(username || ""), login.username) && safeEqual(String(password || ""), login.password);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function readBasicAuth(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const splitAt = decoded.indexOf(":");
    if (splitAt < 0) return null;
    return {
      username: decoded.slice(0, splitAt),
      password: decoded.slice(splitAt + 1),
    };
  } catch {
    return null;
  }
}

async function hasSession(login) {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE)?.value || "";
  return Boolean(session && safeEqual(session, sessionValue(login.username, login.password)));
}

export async function isAuthorized(request, bodyLogin) {
  const login = getLogin();
  if (!login) return { ok: false, reason: "misconfigured" };

  if (await hasSession(login)) return { ok: true, via: "session" };

  const basic = readBasicAuth(request);
  if (basic && matchesLogin(basic.username, basic.password)) return { ok: true, via: "basic" };

  if (bodyLogin && (bodyLogin.username != null || bodyLogin.password != null)) {
    if (matchesLogin(bodyLogin.username, bodyLogin.password)) return { ok: true, via: "body" };
    return { ok: false, reason: "unauthorized" };
  }

  return { ok: false, reason: "unauthorized" };
}

export function unauthorizedBody(auth) {
  if (auth.reason === "misconfigured") {
    return { status: 500, body: { ok: false, error: CONFIG_ERROR } };
  }
  return { status: 401, body: { ok: false, error: "Unauthorized." } };
}

export { SESSION_COOKIE };
