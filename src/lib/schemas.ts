import { z } from "zod";

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

