"use client";

import React, { useEffect } from "react";
import { RefreshCw, Home, ShieldAlert } from "lucide-react";

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Mochex Global Client Exception:", error);
  }, [error]);

  return (
    <div className="min-h-screen w-full bg-[#050f19] text-[#d9e3f3] flex items-center justify-center p-4 font-mono select-none">
      <div className="max-w-md w-full bg-[#0b1420] border border-[#1f2b3c] rounded-2xl p-6 shadow-2xl text-center">
        <div className="w-12 h-12 rounded-xl bg-error/15 border border-error/30 text-error flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={24} />
        </div>

        <h2 className="text-base font-bold text-white mb-2">Application Notice</h2>
        <p className="text-xs text-[#848e9c] mb-4">
          An unexpected interface exception occurred.
        </p>

        {error?.message && (
          <div className="mb-4 p-2.5 rounded-lg bg-[#070e17] border border-[#162130] text-[11px] text-error font-mono text-left overflow-x-auto">
            {error.message}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={() => reset()}
            className="flex-1 py-2.5 px-3 rounded-xl bg-primary-container hover:bg-accent-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
          >
            <RefreshCw size={13} />
            <span>Try Again</span>
          </button>
          <a
            href="/"
            className="py-2.5 px-3 rounded-xl bg-[#121c29] hover:bg-[#1a2738] border border-[#23354c] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
          >
            <Home size={13} />
            <span>Overview</span>
          </a>
        </div>
      </div>
    </div>
  );
}
