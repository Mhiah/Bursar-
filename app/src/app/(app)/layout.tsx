"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BusinessContext } from "@/components/business";
import { AGENT_ADDRESS, network } from "@/lib/arc";
import { Icon, Logo } from "@/components/icons";
import { api, useApi } from "@/components/ui";

const nav = [
  ["/dashboard", "Overview"],
  ["/invoices", "Invoices"],
  ["/customers", "Customers"],
  ["/bills", "Bills"],
  ["/suppliers", "Suppliers"],
  ["/approvals", "Approvals"],
  ["/log", "Decision log"],
  ["/settings", "Rules & settings"],
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
  
  if (error) return <div className="p-10 text-sm text-bad">{error}</div>;
  if (!data?.business?.vault_address) return <div className="p-10 text-sm text-muted">Loading…</div>;

  return (
    <BusinessContext.Provider value={{ business: data.business, vault: data.vault, reload }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen self-start w-64 shrink-0 flex-col border-r border-rule bg-white px-4 py-6 md:flex">
          <Link href="/dashboard" className="mb-1 flex items-center gap-2.5 no-underline">
            <Logo size={30} />
            <span className="font-display text-xl font-extrabold tracking-tight text-ink">Bursar</span>
          </Link>
          <p className="mb-7 truncate pl-0.5 text-xs text-muted">{data.business.name}</p>
          <nav className="space-y-0.5">
            {nav.map(([href, label], i) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm no-underline ${path === href ? "bg-brand-soft font-semibold text-brand" : "text-body hover:bg-cream hover:text-ink"}`}
              >
                <span className={`font-mono text-[11px] ${path === href ? "text-brand" : "text-muted"}`}>{String(i + 1).padStart(2, "0")}</span>
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-4">
            <div className="rounded-xl border border-rule bg-card p-4">
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${agentOn ? "bg-brand-soft text-brand" : "bg-rule-soft text-muted"}`}><Icon name="shield" size={18} /></span>
                <div>
                  <p className="text-sm font-medium">{agentOn ? "Agent on duty" : vault.paused ? "Agent paused" : "Agent off"}</p>
                  <p className="text-xs text-muted">{agentOn ? "Working inside your rules" : "Turn it on in Rules & settings"}</p>
                </div>
              </div>
            </div>
            {network === "testnet" && <p className="rounded bg-clay-soft px-2 py-1 text-xs text-clay-dark">Arc testnet</p>}
            <button
              className="text-xs text-muted hover:text-ink"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST" });
                router.replace("/");
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <div className="min-w-0 flex-1 bg-cream">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-rule bg-white px-4 py-2 md:hidden">
            <span className="mr-1 shrink-0"><Logo size={22} /></span>
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs no-underline ${path === href ? "bg-brand-soft font-semibold text-brand" : "text-body"}`}>
                {label}
              </Link>
            ))}
          </div>
          <main className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:py-10">{children}</main>
        </div>
      </div>
    </BusinessContext.Provider>
  );
}
