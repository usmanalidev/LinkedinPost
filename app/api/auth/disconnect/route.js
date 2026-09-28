import { NextResponse } from "next/server";
import { isAuthorized, unauthorizedBody } from "../../../../lib/apiAuth";
import { deleteTokens } from "../../../../lib/tokenStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await isAuthorized(request);
  if (!auth.ok) {
    const denied = unauthorizedBody(auth);
    return NextResponse.json(denied.body, { status: denied.status });
  }

  try {
    await deleteTokens();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status || 500 });
  }
}
