import { NextRequest, NextResponse } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { approve } from "@/server/riderAccess";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const adminUid = await getUidFromRequest(req);
    if (!adminUid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const { uid } = await params;
    
    const result = await approve(adminUid, uid);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Approve rider error:", error);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }
}
