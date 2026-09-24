import type { CapacitorConfig } from "@capacitor/cli";

// The rider shell loads the deployed web app (server.url) rather than a static
// export — the native bridge still works, and the Vercel deploy is untouched.
// For local dev set CAP_SERVER_URL to your LAN dev URL, e.g.
//   CAP_SERVER_URL=http://192.168.1.20:3000 pnpm exec cap sync android
const serverUrl = process.env.CAP_SERVER_URL ?? "https://www.wakaman.xyz";

const config: CapacitorConfig = {
  appId: "com.wakaman.rider",
  appName: "Waka Man Rider",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"],
    },
  },
};

export default config;
