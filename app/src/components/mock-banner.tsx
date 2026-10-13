"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "./ui";
import { MOCK } from "@/lib/mock";

/** Shown on every page in test mode, so fake money is never mistaken for real money. */
export function MockBanner() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const path = usePathname();
  if (!MOCK) return null;
  const inApp =
    path !== "/" && !path.startsWith("/start") && !path.startsWith("/pay");
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-ink px-4 py-2 text-center text-xs text-white">
      <span>
        Test mode: fake money on your computer. Nothing real is signed or spent.
      </span>
      {inApp && (
        <button
          className="underline disabled:opacity-60"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await api("/api/mock/fund", { method: "POST" });
              window.location.reload();
            } catch (e: any) {
              setMsg(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Adding…" : "Add 100 test USDC to my vault"}
        </button>
      )}
      {msg && <span className="opacity-80">{msg}</span>}
    </div>
  );
}
