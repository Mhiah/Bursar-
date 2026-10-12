"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BusinessContext } from "@/components/business";
import { network } from "@/lib/arc";
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

  if (error) return <div className="p-10 text-sm text-red-700">{error}</div>;
  if (!data?.business?.vault_address) return <div className="p-10 text-sm text-black/50">Loading…</div>;

  return (
    <BusinessContext.Provider value={{ business: data.business, vault: data.vault, reload }}>
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-black/10 bg-white px-4 py-6 md:block">
          <Link href="/dashboard" className="mb-1 block text-lg font-semibold tracking-tight">
            Bursar
          </Link>
          <p className="mb-6 truncate text-xs text-black/50">{data.business.name}</p>
          <nav className="space-y-0.5">
            {nav.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`block rounded-md px-3 py-1.5 text-sm ${path === href ? "bg-brand-soft font-medium text-brand" : "text-black/70 hover:bg-black/5"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            className="mt-8 text-xs text-black/50 hover:text-black"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              router.replace("/");
            }}
          >
            Sign out
          </button>
          {network === "testnet" && <p className="mt-4 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Arc testnet</p>}
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex gap-1 overflow-x-auto border-b border-black/10 bg-white px-4 py-2 md:hidden">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className={`whitespace-nowrap rounded px-2 py-1 text-xs ${path === href ? "bg-brand-soft text-brand" : "text-black/60"}`}>
                {label}
              </Link>
            ))}
          </div>
          <main className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</main>
        </div>
      </div>
    </BusinessContext.Provider>
  );
}
