import { NextResponse } from "next/server";
import { isAuthorized, unauthorizedBody } from "../../../lib/apiAuth";
import { canPersistTokens, readTokens, storageKind } from "../../../lib/tokenStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await isAuthorized(request);
  if (!auth.ok) {
    const denied = unauthorizedBody(auth);
    return NextResponse.json(denied.body, { status: denied.status });
  }

  const saved = await readTokens();
  if (!saved) {
    return NextResponse.json({
      ok: true,
      connected: false,
      storage: storageKind(),
      canPersist: canPersistTokens(),
    });
  }

  return NextResponse.json({
    ok: true,
    connected: true,
    name: saved.name,
    personUrn: saved.personUrn,
    expiresAt: saved.expiresAt,
    refreshExpiresAt: saved.refreshExpiresAt,
    storage: saved.storage,
    canPersist: canPersistTokens(),
  });
}
