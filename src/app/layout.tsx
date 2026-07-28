import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const raleway = localFont({
  src: [
    {
      path: "../fonts/Raleway-VariableFont_wght.ttf",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../fonts/Raleway-Italic-VariableFont_wght.ttf",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "The Waka Man Logistics — on time. every time...",
  description:
    "Register riders, dispatch deliveries, and let clients track every package live on the map — then rate the drop-off. Built for reliable last-mile delivery.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "The Waka Man Logistics",
  },
};

export const viewport: Viewport = {
  themeColor: "#4e397c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${raleway.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

