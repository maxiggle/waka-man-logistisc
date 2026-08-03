// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applySuccessfulPayment } from "@/server/payments";

// Paystack is not a signed-in user — there is deliberately no
// getUidFromRequest here. The HMAC signature over the raw request body *is*
// the authentication.
export async function POST(request: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("PAYSTACK_SECRET_KEY is not set; rejecting webhook.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Read as raw text, not request.json() first — the HMAC is over the exact
  // bytes Paystack sent, and re-serializing a parsed object can change them.
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const signatureValid =
    typeof signature === "string" &&
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  if (!signatureValid) {
    console.error("Paystack webhook signature mismatch — rejecting.");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  if (body?.event !== "charge.success") {
    return NextResponse.json({ ok: true });
  }

  const reference = body?.data?.reference;
  if (typeof reference !== "string" || !reference) {
    console.error("Paystack webhook charge.success with no reference:", body);
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await applySuccessfulPayment(reference);
    if (!result.ok) console.error(`Webhook payment processing rejected for ${reference}:`, result.error);
  } catch (err) {
    // Always 200 once the signature is valid — Paystack retries on non-2xx,
    // and a retry storm on top of a genuine bug helps nobody. Log and move on.
    console.error(`Webhook payment processing threw for ${reference}:`, err);
  }

  return NextResponse.json({ ok: true });
}
