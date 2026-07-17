import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Waka Man Logistics",
    short_name: "Waka Man",
    description:
      "Register riders, dispatch deliveries, and track every package live on the map.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbfb",
    theme_color: "#4e397c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
