"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_OTP } from "@/lib/demo";

export default function OtpForm({ phoneHint }: { phoneHint?: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim() !== DEMO_OTP) {
      setError(`Wrong code. For this demo, enter ${DEMO_OTP}.`);
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="mt-8 rounded-2xl bg-white border border-ink/10 p-8">
      <p className="font-bold text-ink">Enter the 6-digit code</p>
      <p className="mt-1 text-sm text-ink/60">
        Sent to {phoneHint || "your phone"}.{" "}
        <span className="font-semibold text-accent">Demo code: {DEMO_OTP}</span>
      </p>
      <form onSubmit={verify} className="mt-5">
        <label htmlFor="otp" className="sr-only">One-time code</label>
        <input
          id="otp"
          value={otp}
          onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3.5 text-center text-2xl font-extrabold tracking-[0.5em] text-primary placeholder:text-ink/20 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
        <button
          type="submit"
          className="mt-4 w-full rounded-xl bg-primary text-white font-semibold py-3.5 hover:bg-primary-soft transition-colors cursor-pointer"
        >
          Verify &amp; continue
        </button>
      </form>
    </div>
  );
}
