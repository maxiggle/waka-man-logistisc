import crypto from "node:crypto";
import { getAdminDb } from "@/server/firebaseAdmin";
import { PAYABLE_DELIVERY_STATUSES, type DeliveryStatus } from "@/lib/schemas";

const PAYSTACK_API = "https://api.paystack.co";

/**
 * The confirmation code the recipient reads out at handover. Drawn from
 * crypto, not Math.random: it's the sole credential gating completion, and
 * V8's PRNG state is recoverable from its own output.
 */
function newConfirmationCode(): string {
  return String(crypto.randomInt(1000, 10000));
}

function paystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set.");
  return key;
}

export type PaymentActionResult =
  | { ok: true }
  | { ok: false; status: 403 | 404 | 409 | 422 | 500; error: string };

export type InitializeResult =
  | { ok: true; accessCode: string; reference: string }
  | { ok: false; status: 403 | 404 | 409 | 422 | 500; error: string };

/**
 * Initializes a Paystack transaction for a delivery, at the quote frozen
 * onto it at booking (src/server/deliveries.ts). The amount is never taken
 * from the request body — this function accepts no amount at all — and is
 * not recomputed from the price table, so the customer is charged what they
 * were shown however long they take to pay.
 */
export async function initializePayment(
  deliveryId: string,
  callerUid: string,
  callerEmail: string | null,
): Promise<InitializeResult> {
  const db = getAdminDb();
  const deliveryRef = db.collection("deliveries").doc(deliveryId);
  const deliverySnap = await deliveryRef.get();

  if (!deliverySnap.exists)
    return { ok: false, status: 404, error: "Delivery not found." };
  const delivery = deliverySnap.data()!;

  if (delivery.clientId !== callerUid) {
    return {
      ok: false,
      status: 403,
      error: "Only the client who booked this delivery can pay for it.",
    };
  }

  const status = delivery.status as DeliveryStatus;
  if (!PAYABLE_DELIVERY_STATUSES.includes(status)) {
    return {
      ok: false,
      status: 409,
      error: `This delivery can't be paid for while it's ${status}.`,
    };
  }

  if (delivery.paymentStatus === "paid") {
    return {
      ok: false,
      status: 409,
      error: "This delivery has already been paid for.",
    };
  }

  const amountKobo = delivery.quotedAmountKobo;
  if (
    typeof amountKobo !== "number" ||
    !Number.isInteger(amountKobo) ||
    amountKobo <= 0
  ) {
    return {
      ok: false,
      status: 422,
      error: "This delivery has no valid quote and can't be paid for.",
    };
  }

  const email = (delivery.clientEmail as string | undefined) || callerEmail;
  if (!email) {
    return {
      ok: false,
      status: 422,
      error: "No email on file to receipt this payment to.",
    };
  }

  const reference = `wm_${deliveryId}_${Date.now()}`;

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      metadata: { deliveryId },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status || !data?.data?.access_code) {
    console.error("Paystack initialize failed:", res.status, data);
    return {
      ok: false,
      status: 500,
      error: "Could not start payment. Please try again.",
    };
  }

  await deliveryRef.collection("paymentAttempts").doc(reference).set({
    reference,
    amountKobo,
    clientId: callerUid,
    createdAt: Date.now(),
  });

  await deliveryRef.update({
    paymentStatus: "processing",
    updatedAt: Date.now(),
  });

  return { ok: true, accessCode: data.data.access_code as string, reference };
}

/**
 * Verifies a Paystack transaction reference directly with Paystack, then —
 * in one transaction — marks the delivery paid and creates the confirmation
 * code, if it isn't already. Idempotent: called from both the webhook and
 * the client-triggered verify route, which routinely race each other.
 */
export async function applySuccessfulPayment(
  reference: string,
): Promise<PaymentActionResult> {
  const res = await fetch(
    `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${paystackSecretKey()}` },
    },
  );
  const body = await res.json().catch(() => null);
  const data = body?.data;

  if (!res.ok || !data || data.status !== "success") {
    return { ok: false, status: 422, error: "Payment was not successful." };
  }

  const deliveryId = data.metadata?.deliveryId;
  if (typeof deliveryId !== "string" || !deliveryId) {
    return {
      ok: false,
      status: 422,
      error: "Payment is missing its delivery reference.",
    };
  }

  const db = getAdminDb();
  const deliveryRef = db.collection("deliveries").doc(deliveryId);
  const codeRef = deliveryRef.collection("private").doc("code");
  const attemptRef = deliveryRef.collection("paymentAttempts").doc(reference);

  return db.runTransaction(async (tx): Promise<PaymentActionResult> => {
    const [deliverySnap, attemptSnap] = await tx.getAll(
      deliveryRef,
      attemptRef,
    );

    if (!deliverySnap.exists)
      return { ok: false, status: 404, error: "Delivery not found." };
    const delivery = deliverySnap.data()!;

    if (!attemptSnap.exists) {
      return {
        ok: false,
        status: 403,
        error: "This payment reference doesn't match this delivery.",
      };
    }

    if (delivery.paymentStatus === "paid") return { ok: true };

    const quotedAmountKobo = delivery.quotedAmountKobo;
    if (typeof quotedAmountKobo !== "number" || quotedAmountKobo <= 0) {
      return {
        ok: false,
        status: 422,
        error: "This delivery has no valid quote to verify against.",
      };
    }
    if (typeof data.amount !== "number" || data.amount < quotedAmountKobo) {
      return {
        ok: false,
        status: 422,
        error: "Amount received does not match the delivery's fare.",
      };
    }

    tx.update(deliveryRef, {
      paymentStatus: "paid",
      paidAt: Date.now(),
      paidAmountKobo: data.amount,
      paidReference: reference,
      paymentChannel: typeof data.channel === "string" ? data.channel : null,
      updatedAt: Date.now(),
    });

    tx.set(codeRef, {
      code: newConfirmationCode(),
      clientId: delivery.clientId,
    });

    return { ok: true };
  });
}
