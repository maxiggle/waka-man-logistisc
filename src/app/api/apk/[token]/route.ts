import { NextRequest, NextResponse } from "next/server";
import { redeemToken } from "@/server/riderAccess";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    
    const result = await redeemToken(token);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ downloadUrl: result.downloadUrl });
  } catch (error) {
    console.error("Redeem token error:", error);
    return NextResponse.json({ error: "Failed to process download link" }, { status: 500 });
  }
}
