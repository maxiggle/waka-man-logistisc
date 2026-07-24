import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the Capacitor rider shell load dev assets over the LAN.
  allowedDevOrigins: ["172.20.10.4"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
