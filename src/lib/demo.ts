// Dummy data powering the demo. Swap this module for Firebase reads later.

export type DeliveryStatus =
  | "requested"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "arrived"
  | "delivered";

export type Delivery = {
  id: string;
  status: DeliveryStatus;
  pickup: string;
  dropoff: string;
  packageNote: string;
  fare: string;
  code: string;
  rider: {
    name: string;
    initials: string;
    vehicle: string;
    plate: string;
    rating: number;
  };
  /** 0..1 — how far along the route the demo starts */
  startProgress: number;
  /** seconds the live simulation takes to reach the door */
  duration: number;
};

export const deliveries: Delivery[] = [
  {
    id: "WM-2481",
    status: "in_transit",
    pickup: "14 Adeola Odeku St, Victoria Island",
    dropoff: "3 Allen Avenue, Ikeja",
    packageNote: "Documents · Express",
    fare: "₦1,500",
    code: "4821",
    rider: { name: "Tunde A.", initials: "TA", vehicle: "Honda CG 125", plate: "LAG-234-XP", rating: 4.9 },
    startProgress: 0.32,
    duration: 75,
  },
  {
    id: "WM-2479",
    status: "assigned",
    pickup: "27 Awolowo Road, Ikoyi",
    dropoff: "11 Bode Thomas St, Surulere",
    packageNote: "Small parcel · Standard",
    fare: "₦900",
    code: "7350",
    rider: { name: "Chioma O.", initials: "CO", vehicle: "TVS HLX", plate: "KJA-881-QT", rating: 4.8 },
    startProgress: 0,
    duration: 90,
  },
  {
    id: "WM-2478",
    status: "delivered",
    pickup: "5 Admiralty Way, Lekki Phase 1",
    dropoff: "18 Opebi Road, Ikeja",
    packageNote: "Food items · Bulk",
    fare: "₦2,400",
    code: "1194",
    rider: { name: "Ibrahim S.", initials: "IS", vehicle: "Bajaj Boxer", plate: "EPE-412-KL", rating: 5.0 },
    startProgress: 1,
    duration: 0,
  },
];

export function getDelivery(id: string): Delivery | undefined {
  return deliveries.find((d) => d.id.toLowerCase() === id.toLowerCase());
}

/** The one-time code every demo sign-in accepts. */
export const DEMO_OTP = "123456";

// --- Client-side store for deliveries created during the demo session ---

const LOCAL_KEY = "wm-demo-deliveries";

export function saveLocalDelivery(d: Delivery) {
  if (typeof window === "undefined") return;
  const all = JSON.parse(sessionStorage.getItem(LOCAL_KEY) ?? "[]") as Delivery[];
  sessionStorage.setItem(LOCAL_KEY, JSON.stringify([...all.filter((x) => x.id !== d.id), d]));
}

export function getLocalDelivery(id: string): Delivery | undefined {
  if (typeof window === "undefined") return undefined;
  const all = JSON.parse(sessionStorage.getItem(LOCAL_KEY) ?? "[]") as Delivery[];
  return all.find((d) => d.id.toLowerCase() === id.toLowerCase());
}

export function createDelivery(input: {
  pickup: string;
  dropoff: string;
  vehicle: "express" | "standard" | "bulk";
}): Delivery {
  const fares = { express: "₦1,500", standard: "₦900", bulk: "₦2,400" };
  const notes = { express: "Express · Motorbike", standard: "Standard · Scooter", bulk: "Bulk · Car" };
  const rider = riders[Math.floor(Math.random() * riders.length)];
  const d: Delivery = {
    id: `WM-${Math.floor(2500 + Math.random() * 7000)}`,
    status: "picked_up",
    pickup: input.pickup,
    dropoff: input.dropoff,
    packageNote: notes[input.vehicle],
    fare: fares[input.vehicle],
    code: String(Math.floor(1000 + Math.random() * 9000)),
    rider: {
      name: rider.name,
      initials: rider.initials,
      vehicle: "Honda CG 125",
      plate: `LAG-${Math.floor(100 + Math.random() * 900)}-XP`,
      rating: rider.rating,
    },
    startProgress: 0,
    duration: 80,
  };
  saveLocalDelivery(d);
  return d;
}

export const riders = [
  { name: "Ibrahim S.", initials: "IS", deliveries: 1892, rating: 5.0, onTime: 99.1 },
  { name: "Tunde A.", initials: "TA", deliveries: 1248, rating: 4.9, onTime: 98.2 },
  { name: "Chioma O.", initials: "CO", deliveries: 976, rating: 4.8, onTime: 97.5 },
  { name: "Emeka N.", initials: "EN", deliveries: 811, rating: 4.8, onTime: 96.9 },
  { name: "Funke B.", initials: "FB", deliveries: 645, rating: 4.7, onTime: 96.1 },
];
