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
  "assigned",
  "picked_up",
  "in_transit",
  "arrived",
  "delivered",
  "cancelled",
]);

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
  fare?: string;
  code?: string;
  vehicle?: string;
  rider?: DeliveryRiderInfo | null;
  startProgress?: number;
  duration?: number;
  createdAt?: number;
  assignedAt?: number | null;
  deliveredAt?: number | null;
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

export type Rider = z.infer<typeof riderSchema>;
export type Client = z.infer<typeof clientSchema>;
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export type Rating = z.infer<typeof ratingSchema>;
export type RiderAvailability = z.infer<typeof riderAvailabilitySchema>;

