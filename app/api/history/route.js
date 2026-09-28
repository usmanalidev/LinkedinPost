import { NextResponse } from "next/server";
import { isAuthorized, unauthorizedBody } from "../../../lib/apiAuth";
import { listHistory } from "../../../lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await isAuthorized(request);
  if (!auth.ok) {
    const denied = unauthorizedBody(auth);
    return NextResponse.json(denied.body, { status: denied.status });
  }

  const posts = await listHistory();
  return NextResponse.json({ ok: true, posts });
}
