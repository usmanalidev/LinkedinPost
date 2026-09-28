import { NextResponse } from "next/server";
import { CONFIG_ERROR, SESSION_COOKIE, cookieOptions, getLogin, matchesLogin, sessionValue } from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const login = getLogin();
  if (!login) {
    return NextResponse.json({ ok: false, error: CONFIG_ERROR }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  if (!matchesLogin(body.username, body.password)) {
    return NextResponse.json({ ok: false, error: "Wrong username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, sessionValue(login.username, login.password), cookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
