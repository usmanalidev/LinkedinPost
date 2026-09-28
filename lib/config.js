export function getBaseUrl(request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export function getRedirectUri(request) {
  if (process.env.LINKEDIN_REDIRECT_URI) return process.env.LINKEDIN_REDIRECT_URI;
  return `${getBaseUrl(request)}/api/auth/callback`;
}

export function linkedInVersion() {
  return process.env.LINKEDIN_VERSION || "202609";
}

export function requireLinkedInApp() {
  const clientId = process.env.LINKEDIN_CLIENT_ID || "";
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    const error = new Error("Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.");
    error.status = 500;
    throw error;
  }
  return { clientId, clientSecret };
}
