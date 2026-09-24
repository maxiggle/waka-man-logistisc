import { NextRequest, NextResponse } from "next/server";
import { getUidAndEmailFromRequest } from "@/server/firebaseAdmin";
import { createRequest } from "@/server/riderAccess";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userContext = await getUidAndEmailFromRequest(req);
    
    if (!userContext || !userContext.email) {
      return NextResponse.json({ error: "Unauthorized or missing email" }, { status: 401 });
    }

    const { uid, email, name } = userContext;
    
    const result = await createRequest(uid, email, name || "Rider");
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Request rider access error:", error);
    return NextResponse.json({ error: "Failed to request access" }, { status: 500 });
  }
}
