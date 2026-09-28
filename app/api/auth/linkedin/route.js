import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { CONFIG_ERROR, isAuthorized } from "../../../../lib/apiAuth";
import { getBaseUrl, getRedirectUri, requireLinkedInApp } from "../../../../lib/config";
import { buildAuthorizationUrl } from "../../../../lib/linkedin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await isAuthorized(request);
  if (!auth.ok) {
    const message = auth.reason === "misconfigured"
      ? CONFIG_ERROR
      : "Unlock the site before connecting LinkedIn.";
    return NextResponse.redirect(`${getBaseUrl(request)}/?error=${encodeURIComponent(message)}`);
  }

  try {
    const { clientId } = requireLinkedInApp();
    const state = randomBytes(24).toString("hex");
    const redirectUri = getRedirectUri(request);
    const url = buildAuthorizationUrl({ clientId, redirectUri, state });
    const response = NextResponse.redirect(url);
    response.cookies.set("lp_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    return response;
  } catch (error) {
    const message = error.message || "Could not start LinkedIn login.";
    return NextResponse.redirect(`${getBaseUrl(request)}/?error=${encodeURIComponent(message)}`);
  }
}
