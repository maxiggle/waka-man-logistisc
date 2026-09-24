"use client";

import { useState, use } from "react";

export default function DownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/apk/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to get download link");
      }
      window.location.href = data.downloadUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#141019] text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-white.png" alt="" className="h-12 w-auto mb-4" />
          <h1 className="text-2xl font-extrabold font-display">Waka Man Rider</h1>
          <p className="text-white/60 text-sm mt-2 text-center">
            Your rider application is approved. Download the Android app to get started.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleDownload}
          disabled={loading}
          className="w-full rounded-2xl bg-accent text-[#141019] font-bold py-4 hover:bg-accent-tint transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Preparing download..." : "Download App"}
        </button>
      </div>
    </main>
  );
}
