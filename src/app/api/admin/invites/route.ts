// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidAndEmailFromRequest } from "@/server/firebaseAdmin";
import { grantInvite, revokeInvite, type InviteKind } from "@/server/invites";

function parseKind(value: unknown): InviteKind | null {
  return value === "admin" || value === "superadmin" ? value : null;
}

/**
 * Grant (POST) and revoke (DELETE) an admin or superadmin invite.
 *
 * Caller identity comes from the verified token, never the body — the
 * previous client-side versions took invitedBy/callerEmail as arguments,
 * which meant the self-revoke guard was checking a value the caller
 * supplied. Both routes re-check the caller's role from Firestore inside
 * src/server/invites.ts rather than trusting anything on the request.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getUidAndEmailFromRequest(request);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const kind = parseKind(body?.kind);
    if (!kind) return NextResponse.json({ error: "kind must be 'admin' or 'superadmin'." }, { status: 400 });

    const result = await grantInvite(kind, body?.email, caller.uid);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/invites failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const caller = await getUidAndEmailFromRequest(request);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const kind = parseKind(body?.kind);
    if (!kind) return NextResponse.json({ error: "kind must be 'admin' or 'superadmin'." }, { status: 400 });

    const result = await revokeInvite(kind, body?.email, caller.uid, caller.email);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/invites failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
