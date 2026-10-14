"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BusinessContext } from "@/components/business";
import { ChangesProvider } from "@/components/changes";
import { AGENT_ADDRESS, network } from "@/lib/arc";
import { Mark, Wordmark } from "@/components/mark";
import { api, useApi } from "@/components/ui";

const nav = [
  ["/dashboard", "Overview"],
  ["/customers", "Customers"],
  ["/invoices", "Invoices"],
  ["/bills", "Bills"],
  ["/suppliers", "Suppliers"],
  ["/approvals", "Approvals"],
  ["/log", "Decision log"],
  ["/settings", "Rules & settings"],
  ["/savings", "Savings"],
] as const;

export default function AppLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data, loading, reload, error } = useApi<{ business: any; vault: any }>("/api/business");

  useEffect(() => {
    if (!loading && (!data?.business || !data.business.vault_address)) router.replace("/start");
  }, [loading, data, router]);

  const vault = data?.vault;
  const agentOn = !!vault && vault.agent?.toLowerCase() === AGENT_ADDRESS.toLowerCase() && !vault.paused;
  const agentMood = agentOn ? "duty" : "paused";

  if (error) return <div className="p-10 text-sm text-bad">{error}</div>;
  if (!data?.business?.vault_address) return <div className="p-10 text-sm text-ink">Loading…</div>;

  return (
    <BusinessContext.Provider value={{ business: data.business, vault: data.vault, reload }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen self-start w-64 shrink-0 flex-col border-r border-rule bg-cream px-5 py-6 md:flex">
          <Link href="/dashboard" className="mb-1 flex items-center no-underline">
            <Wordmark height={42} />
          </Link>
          <p className="mb-7 truncate pl-0.5 text-xs text-ink">{data.business.name}</p>
          <nav className="space-y-0.5">
            {nav.map(([href, label], i) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm no-underline ${path === href ? "bg-ink text-paper" : "text-ink hover:bg-rule-soft hover:text-ink"}`}
              >
                <span className={`font-mono text-[11px] ${path === href ? "text-paper" : "text-ink"}`}>{String(i + 1).padStart(2, "0")}</span>
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-4">
            <div className="rounded-xl border border-rule bg-card p-4">
              <div className="flex items-center gap-3">
                <Mark size={34} mood={agentMood} />
                <div>
                  <p className="text-sm font-medium">{agentOn ? "Agent on duty" : vault.paused ? "Agent paused" : "Agent off"}</p>
                  <p className="text-xs text-ink">{agentOn ? "Working inside your rules" : "Turn it on in Rules & settings"}</p>
                </div>
              </div>
            </div>
            {network === "testnet" && <p className="rounded bg-clay-soft px-2 py-1 text-xs text-ink">Arc testnet</p>}
            <button
              className="text-xs text-ink hover:text-ink"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST" });
                router.replace("/");
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-rule bg-cream px-4 py-2 md:hidden">
            <Mark size={22} mood={agentMood} className="mr-1 shrink-0" />
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs no-underline ${path === href ? "bg-ink text-paper" : "text-ink"}`}>
                {label}
              </Link>
            ))}
          </div>
          <main className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:py-10">
            <ChangesProvider>{children}</ChangesProvider>
          </main>
        </div>
      </div>
    </BusinessContext.Provider>
  );
}
