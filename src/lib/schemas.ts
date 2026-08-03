import { z } from "zod";
import type { ServiceLevel } from "@/lib/dispatchConfig";

export const riderSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email(),
  vehicle: z.enum(["scooter", "motorbike", "car", "bicycle"]),
  ratingAvg: z.number().min(0).max(5).default(0),
  ratingCount: z.number().int().nonnegative().default(0),
  deliveriesCompleted: z.number().int().nonnegative().default(0),
  createdAt: z.number(),
});

export const clientSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email(),
  createdAt: z.number(),
});

export const deliveryStatusSchema = z.enum([
  "pending",
  "offered",
  "assigned",
  "picked_up",
  "in_transit",
  "arrived",
  "delivered",
  "cancelled",
]);

/**
 * Legal next-statuses for a rider-driven delivery lifecycle transition,
 * keyed by current status. Shared between client (button visibility) and
 * server (the actual authorization check, inside the transaction) so the
 * two can't drift — same pattern as VEHICLE_ELIGIBILITY in dispatchConfig.ts.
 *
 * "pending" here means the assigned rider releasing the job *before*
 * pickup — a different event from "cancelled", which is reserved for
 * client/admin-initiated cancellation (no endpoint exists for that yet).
 * Once a rider has physically picked up the package, release is no longer
 * offered: there's no sane automated way to return a package to the pool
 * that a rider is physically holding.
 *
 * "offered" has no legal targets here on purpose. This map governs
 * rider-driven transitions through /api/deliveries/[id]/status; offering,
 * accepting and rejecting are separate operations with their own endpoints
 * and their own authorization (src/server/dispatch.ts,
 * src/server/deliveryOffers.ts). Routing them through the generic status
 * endpoint would let a rider assign themselves work by writing a status.
 */
export const DELIVERY_STATUS_TRANSITIONS: Record<z.infer<typeof deliveryStatusSchema>, z.infer<typeof deliveryStatusSchema>[]> = {
  pending: [],
  offered: [],
  assigned: ["picked_up", "pending"],
  picked_up: ["in_transit"],
  in_transit: ["arrived"],
  arrived: ["delivered"],
  delivered: [],
  cancelled: [],
};

/**
 * Statuses a delivery can be paid for in. Not "pending"/"offered" (no rider
 * committed yet), not "delivered"/"cancelled" (nothing left to unlock).
 * Shared so payment initialize (src/server/payments.ts) can't drift from
 * whatever this list is meant to represent.
 */
export const PAYABLE_DELIVERY_STATUSES: z.infer<typeof deliveryStatusSchema>[] = [
  "assigned",
  "picked_up",
  "in_transit",
  "arrived",
];

export interface DeliveryRiderInfo {
  name: string;
  initials: string;
  vehicle?: string;
  plate?: string;
  rating?: number;
}

export interface DeliveryItem {
  id: string;
  clientId?: string;
  riderId?: string | null;
  status: z.infer<typeof deliveryStatusSchema>;
  pickup: string | { address: string; lat?: number; lng?: number };
  dropoff: string | { address: string; lat?: number; lng?: number };
  packageNote?: string;
  /**
   * The fare, in integer kobo, frozen at booking by src/server/deliveries.ts.
   * Server-written and never updated — this is what the customer was quoted
   * and the only figure payment verification will accept. Every price the
   * UI shows derives from this field, formatted at render (formatNaira);
   * there is deliberately no pre-formatted `fare` string on the document,
   * because a display string the client wrote can disagree with the amount
   * the server actually charges.
   *
   * Optional only for deliveries created before this field existed; they
   * cannot be paid for (src/server/payments.ts fails them closed).
   */
  quotedAmountKobo?: number;
  // Confirmation code deliberately lives at deliveries/{id}/private/code,
  // not here — this document is what the assigned rider's own query reads,
  // and the code must not be in their memory before the recipient tells
  // them (see src/server/deliveryLifecycle.ts).
  vehicle?: string;
  rider?: DeliveryRiderInfo | null;
  createdAt?: number;
  assignedAt?: number | null;
  deliveredAt?: number | null;
  // Offer round state (status "offered" only) — see src/server/dispatch.ts
  // and src/server/deliveryOffers.ts. Cleared whenever the delivery leaves
  // "offered" (accepted, all rejected, or the offer lapses).
  offeredTo?: string[];
  offeredAt?: number | null;
  offerExpiresAt?: number | null;
  // Uids who have rejected this delivery. Persists across offer rounds so a
  // rider who rejects is never offered the same delivery again.
  rejectedBy?: string[];
  // Payment state (W5-T2) — server-written only, via src/server/payments.ts.
  // Absent paymentStatus is equivalent to "unpaid"; the confirmation code
  // doc (deliveries/{id}/private/code) does not exist until paymentStatus
  // becomes "paid", so there's nothing gating it to leak.
  /** Server-written only. Absent is equivalent to "unpaid". */
  paymentStatus?: "processing" | "paid" | "failed";
  /**
   * The reference that actually settled. Issued references live in
   * deliveries/{id}/paymentAttempts/{reference} instead of a single field
   * here — a customer may have several in flight, and any of them settling
   * is a real payment we have to honour.
   */
  paidReference?: string;
  paidAt?: number | null;
  /** Integer kobo actually received, for reconciliation against the quote. */
  paidAmountKobo?: number | null;
  /** "card", "bank_transfer", etc. — whatever Paystack reports. */
  paymentChannel?: string | null;
}

export type LatLng = { lat: number; lng: number };

/**
 * Coordinates for a delivery endpoint, or null when unavailable — the field is
 * a plain address string on older records, and lat/lng are optional even on the
 * object form (a booking whose geocode failed).
 */
export function coordsOf(
  place: string | { address: string; lat?: number; lng?: number } | undefined,
): LatLng | null {
  if (!place || typeof place === "string") return null;
  if (typeof place.lat !== "number" || typeof place.lng !== "number") return null;
  return { lat: place.lat, lng: place.lng };
}

// Rider self-reported availability, written to riderAvailability/{uid} while a
// rider is online and looking for jobs. Untrusted input (any signed-in rider
// can write their own doc) — validate shape/ranges before matching on it,
// same reasoning as riderPositionSchema below.
export const riderAvailabilitySchema = z.object({
  riderId: z.string(),
  name: z.string(),
  vehicle: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  geohash: z.string().min(1),
  status: z.enum(["online", "busy"]),
  updatedAt: z.number().int().positive(),
});

// A delivery's requested service tier (untrusted — read back from a
// client-created Firestore document). Casting `vehicle: string` to
// ServiceLevel behind nothing but a typeof check let a garbage tier value
// become silently unmatchable, with no signal anywhere — validate it
// instead, at every site that reads it off a delivery document.
export const serviceLevelSchema = z.enum(["standard", "express", "bulk"]);

// Compile-time guarantee that the enum above and dispatchConfig's
// ServiceLevel union can never drift apart silently — exactly the kind of
// drift W1F-T1 existed to fix. If either gains or loses a member without
// updating the other, this line fails to typecheck. Tuple-wrapped to
// disable TypeScript's default distributive behavior for conditional types
// over a naked union type parameter — without this, the check runs
// per-member instead of as a single set-equality comparison and silently
// fails to catch drift.
type AssertExactUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _serviceLevelMatchesDispatchConfig: AssertExactUnion<z.infer<typeof serviceLevelSchema>, ServiceLevel> = true;
void _serviceLevelMatchesDispatchConfig;

/** A resolved address with coordinates, as booking submits it. */
const endpointSchema = z.object({
  address: z.string().min(1).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * The complete set of fields a customer may supply when booking. Everything
 * else on a delivery — clientId, status, riderId, quotedAmountKobo, all
 * timestamps — is derived server-side by src/server/deliveries.ts, so this
 * schema is also the authorization boundary: a field absent here cannot be
 * set by a caller at all. `.strict()` makes that enforcement rather than
 * convention, rejecting a body that tries to smuggle in extras.
 *
 * Note `vehicle` is validated here. Under the old client-write path the
 * rules could not check it, so an unrecognized tier produced a delivery that
 * was silently unpriceable and unmatchable; now it's a 400 at the door.
 */
export const deliveryCreateSchema = z
  .object({
    pickup: endpointSchema,
    dropoff: endpointSchema,
    vehicle: serviceLevelSchema,
    packageNote: z.string().max(500).optional(),
  })
  .strict();

export type DeliveryCreateInput = z.infer<typeof deliveryCreateSchema>;

export const ratingSchema = z.object({
  deliveryId: z.string(),
  riderId: z.string(),
  clientId: z.string(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  createdAt: z.number(),
});

export const riderPositionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  heading: z.number().min(0).max(360).nullable(),
  speed: z.number().nonnegative().nullable(),
  timestamp: z.number().int().positive(),
  isMock: z.boolean(),
});

// An admin-managed service area (serviceAreas/{id}) — the search bias and map
// fallback centre, never a hard restriction on where a delivery can be booked
// (see src/lib/serviceAreas.ts). Untrusted the same way any Firestore read is:
// validate before use rather than trusting a doc shape survived hand edits.
export const serviceAreaSchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean(),
  active: z.boolean(),
  createdAt: z.number(),
});

export type Rider = z.infer<typeof riderSchema>;
export type Client = z.infer<typeof clientSchema>;
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export type Rating = z.infer<typeof ratingSchema>;
export type RiderAvailability = z.infer<typeof riderAvailabilitySchema>;
export type ServiceAreaDoc = z.infer<typeof serviceAreaSchema>;

