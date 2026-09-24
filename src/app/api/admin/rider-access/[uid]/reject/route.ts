import { NextRequest, NextResponse } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { reject } from "@/server/riderAccess";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const adminUid = await getUidFromRequest(req);
    if (!adminUid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const { uid } = await params;
    
    const result = await reject(adminUid, uid);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reject rider error:", error);
    return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
  }
}
