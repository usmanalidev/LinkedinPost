import { NextResponse } from "next/server";
import { isAuthorized, unauthorizedBody } from "../../../lib/apiAuth";
import { listHistory, queryHistory } from "../../../lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await isAuthorized(request);
  if (!auth.ok) {
    const denied = unauthorizedBody(auth);
    return NextResponse.json(denied.body, { status: denied.status });
  }

  const params = request.nextUrl.searchParams;
  const from = parseInstant(params.get("from"));
  const to = parseInstant(params.get("to"));
  const page = parsePage(params.get("page"));
  if (from === undefined || to === undefined || page === undefined) {
    return NextResponse.json({ ok: false, error: "Use a valid date range and page number." }, { status: 400 });
  }
  if (from !== null && to !== null && from > to) {
    return NextResponse.json({ ok: false, error: "The start time is after the end time." }, { status: 400 });
  }

  const posts = await listHistory();
  return NextResponse.json({ ok: true, ...queryHistory(posts, { from, to, page }) });
}

function parseInstant(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

function parsePage(value) {
  if (!value) return 1;
  if (!/^\d+$/.test(value)) return undefined;
  const page = Number(value);
  return page >= 1 ? page : undefined;
}
