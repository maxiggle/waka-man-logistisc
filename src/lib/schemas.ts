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
  "delivered",
  "cancelled",
]);

export const deliverySchema = z.object({
  id: z.string(),
  clientId: z.string(),
  riderId: z.string().nullable(),
  status: deliveryStatusSchema,
  pickup: z.object({ address: z.string(), lat: z.number(), lng: z.number() }),
  dropoff: z.object({ address: z.string(), lat: z.number(), lng: z.number() }),
  createdAt: z.number(),
  deliveredAt: z.number().nullable(),
});

export const ratingSchema = z.object({
  id: z.string(),
  deliveryId: z.string(),
  clientId: z.string(),
  riderId: z.string(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  createdAt: z.number(),
});

export type Rider = z.infer<typeof riderSchema>;
export type Client = z.infer<typeof clientSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;
export type Rating = z.infer<typeof ratingSchema>;
