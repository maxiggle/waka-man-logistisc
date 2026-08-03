// Kobo is the unit of record everywhere money is stored or compared: it's
// Paystack's smallest unit, and it's an integer, so no fare arithmetic ever
// goes through a float. Naira strings exist only at render time — never on a
// Firestore document, never in a request body, never compared against.

/** Renders integer kobo as a "₦1,500"-style string. */
export function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

/**
 * Renders a delivery's stored quote, or a neutral placeholder when it has
 * none. Only deliveries booked before quotedAmountKobo existed lack it —
 * they can't be paid for either, so showing a made-up figure would be worse
 * than showing nothing.
 */
export function formatQuote(kobo: number | undefined | null): string {
  return typeof kobo === "number" ? formatNaira(kobo) : "—";
}
