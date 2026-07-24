import type { CapacitorConfig } from "@capacitor/cli";

// The rider shell loads the deployed web app (server.url) rather than a static
// export — the native bridge still works, and the Vercel deploy is untouched.
// For local dev set CAP_SERVER_URL to your LAN dev URL, e.g.
//   CAP_SERVER_URL=http://192.168.1.20:3000 pnpm exec cap sync android
const serverUrl = process.env.CAP_SERVER_URL ?? "https://temptransport.vercel.app";

const config: CapacitorConfig = {
  appId: "com.wakaman.rider",
  appName: "Waka Man Rider",
  // Placeholder only — the WebView loads server.url, not this directory.
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
};

export default config;
