import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { safeEqual } from "../../../../lib/apiAuth";
import { getBaseUrl, getRedirectUri } from "../../../../lib/config";
import { exchangeCode, fetchMember, tokensFromOAuth } from "../../../../lib/linkedin";
import { saveTokens } from "../../../../lib/tokenStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${getBaseUrl(request)}/?error=${encodeURIComponent(oauthError)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const jar = await cookies();
  const expected = jar.get("lp_oauth_state")?.value || "";

  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return NextResponse.redirect(
      `${getBaseUrl(request)}/?error=${encodeURIComponent("LinkedIn login did not complete. Start it again from this site.")}`
    );
  }

  try {
    const redirectUri = getRedirectUri(request);
    const oauth = await exchangeCode({ code, redirectUri });
    const member = await fetchMember(oauth.access_token, oauth.id_token);
    await saveTokens(tokensFromOAuth(oauth, member));

    const response = NextResponse.redirect(`${getBaseUrl(request)}/?connected=1`);
    response.cookies.set("lp_oauth_state", "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    if (error.code === "NO_STORE" && error.tokens) {
      const response = new NextResponse(manualTokenPage(error.tokens), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
      response.cookies.set("lp_oauth_state", "", { path: "/", maxAge: 0 });
      return response;
    }

    const message = error.message || "LinkedIn connection failed.";
    const response = NextResponse.redirect(`${getBaseUrl(request)}/?error=${encodeURIComponent(message)}`);
    response.cookies.set("lp_oauth_state", "", { path: "/", maxAge: 0 });
    return response;
  }
}

function manualTokenPage(tokens) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex" />
  <title>Save LinkedIn tokens</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; background: #f4f1ea; color: #1c1915; margin: 0; }
    main { max-width: 720px; margin: 40px auto; padding: 0 20px 48px; }
    h1 { font-size: 1.6rem; }
    p, li { line-height: 1.5; }
    label { display: block; margin-top: 16px; font-weight: 650; }
    textarea { width: 100%; min-height: 72px; box-sizing: border-box; font-family: ui-monospace, monospace; }
    .warn { background: #fff4d6; border: 1px solid #e6c56a; padding: 12px 14px; }
  </style>
</head>
<body>
  <main>
    <h1>LinkedIn connected, but tokens were not stored</h1>
    <p class="warn">This deployment has no private Vercel Blob store, so the server cannot remember the login. Copy the values below into Vercel environment variables, redeploy, and do not leave this page open.</p>
    <ol>
      <li>Create a private Blob store and connect it to the project if you want automatic token refresh. Then connect LinkedIn again and ignore this page.</li>
      <li>Or paste these into the project environment and redeploy. Refresh will not be saved until a Blob store exists.</li>
    </ol>
    ${field("LINKEDIN_ACCESS_TOKEN", tokens.accessToken)}
    ${field("LINKEDIN_REFRESH_TOKEN", tokens.refreshToken || "")}
    ${field("LINKEDIN_PERSON_URN", tokens.personUrn)}
    ${field("LINKEDIN_TOKEN_EXPIRES_AT", tokens.expiresAt ? String(tokens.expiresAt) : "")}
    ${field("LINKEDIN_MEMBER_NAME", tokens.name || "")}
  </main>
</body>
</html>`;
}

function field(name, value) {
  return `<label for="${escapeHtml(name)}">${escapeHtml(name)}</label>
<textarea id="${escapeHtml(name)}" readonly>${escapeHtml(value)}</textarea>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
