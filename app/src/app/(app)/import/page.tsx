"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { api, Field, Notice, useAction, useApi } from "@/components/ui";

type Kind = "invoices" | "bills";
type Row = { row: number; ok: boolean; who: string; invoice_no: string; amount: string | null; due_date: string | null; problem?: string; notes: string[] };
type Result = { kind: Kind; created: number; skipped: number; rows: Row[] };

// The template's headings and an example row to replace.
const TEMPLATE: Record<Kind, string[][]> = {
  invoices: [
    ["Customer", "Customer email", "Invoice no.", "Amount (USDC)", "Due date", "What for"],
    ["Ada Stores", "ada@example.com", "INV-101", "25", "2026-12-31", "2 pairs of sneakers"],
  ],
  bills: [
    ["Supplier", "Supplier wallet", "Their invoice no.", "Amount (USDC)", "Due date", "Budget category", "Agreed amount", "What for"],
    ["Lagos Leather Co", "0x…", "LL-2041", "120", "2026-12-31", "stock", "120", "Leather for December"],
  ],
};

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV text to rows. Handles quotes, and commas or semicolons between cells. */
function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(cur), (cur = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur), rows.push(row), (row = []), (cur = "");
    } else cur += c;
  }
  if (cur || row.length) row.push(cur), rows.push(row);
  return rows;
}

const value = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

/** A spreadsheet file to one object per row, keyed by the headings in the first row. */
async function readFile(file: File): Promise<Record<string, unknown>[]> {
  let grid: unknown[][];
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    grid = (await readSheet(file)) as unknown[][];
  } else if (/\.(csv|txt)$/i.test(file.name)) {
    grid = parseCsv(await file.text());
  } else throw new Error("Use a .csv or .xlsx file. In Google Sheets: File, Download, then .csv or .xlsx.");
  const filled = grid.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (filled.length < 2) throw new Error("The file needs a row of headings and at least one row under it.");
  const heads = filled[0].map((h) => String(h ?? "").trim());
  return filled.slice(1).map((r) => Object.fromEntries(heads.map((h, i) => [h, value(r[i])]).filter(([h]) => h)));
}

export default function Import() {
  const params = useSearchParams();
  const [kind, setKind] = useState<Kind>(params.get("kind") === "bills" ? "bills" : "invoices");
  const [file, setFile] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, unknown>[] | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const check = useAction();
  const add = useAction();

  const reset = (k: Kind = kind) => {
    setKind(k);
    setFile(null);
    setRecords(null);
    setPreview(null);
    setDone(null);
    check.setError(null);
    add.setError(null);
    if (input.current) input.current.value = "";
  };

  const template = () => {
    const csv = TEMPLATE[kind].map((r) => r.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `bursar-${kind}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const choose = (f: File | undefined) => {
    if (!f) return;
    setDone(null);
    setPreview(null);
    setFile(f.name);
    check.run(async () => {
      const recs = await readFile(f);
      setRecords(recs);
      setPreview(await api<Result>("/api/import", { method: "POST", json: { kind, records: recs, create: false } }));
    });
  };

  const ready = preview?.rows.filter((r) => r.ok).length ?? 0;
  const word = (n: number) => (kind === "invoices" ? (n === 1 ? "invoice" : "invoices") : n === 1 ? "bill" : "bills");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="h-page">Add many at once</h1>
        <p className="mt-3 text-sm text-ink">Bring in invoices or bills from a spreadsheet, or connect your AI assistant or your own software.</p>
      </div>

      <div className="flex gap-2">
        {(["invoices", "bills"] as const).map((k) => (
          <button key={k} className={kind === k ? "btn-ink" : "btn-ghost"} onClick={() => reset(k)}>
            {k === "invoices" ? "Invoices" : "Bills"}
          </button>
        ))}
      </div>

      <section className="card space-y-4">
        <h2 className="h-section">From a spreadsheet</h2>
        <p className="text-sm text-ink">
          Use a .csv or .xlsx file with one {kind === "invoices" ? "invoice" : "bill"} per row. The first row is the headings.{" "}
          {kind === "invoices"
            ? "Customers are matched by name, and new names are added as new customers."
            : "Suppliers are matched by name. A new supplier needs their wallet, and you approve it before the agent can pay them."}{" "}
          Dates can be 2026-12-31 or 31/12/2026.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-ghost" onClick={template}>Download template</button>
          <label className="btn cursor-pointer">
            Choose file
            <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          {file && <span className="text-sm text-ink">{file}</span>}
        </div>
        {check.busy && <p className="text-sm text-ink">Checking every row…</p>}
        {check.error && <Notice kind="bad">{check.error}</Notice>}

        {preview && !done && (
          <>
            <p className="text-sm">
              <b>{ready}</b> {word(ready)} ready to add{preview.skipped ? <>, <b>{preview.skipped}</b> will be skipped</> : null}. Nothing is added until you press the button.
            </p>
            <RowsTable kind={kind} rows={preview.rows} />
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn"
                disabled={!ready || add.busy}
                onClick={() =>
                  add.run(async () => {
                    setDone(await api<Result>("/api/import", { method: "POST", json: { kind, records, create: true } }));
                    setPreview(null);
                  })
                }
              >
                {add.busy ? "Adding…" : `Add ${ready} ${word(ready)}`}
              </button>
              <button className="btn-ghost" onClick={() => reset()}>Cancel</button>
            </div>
            {add.error && <Notice kind="bad">{add.error}</Notice>}
          </>
        )}

        {done && (
          <>
            <Notice kind="ok">
              Added {done.created} {word(done.created)}
              {done.skipped ? `. ${done.skipped} skipped, see why below` : ""}. It's written in the decision log.{" "}
              <Link href={`/${kind}`} className="font-medium underline">See {kind}</Link>
            </Notice>
            {(done.skipped > 0 || done.rows.some((r) => r.notes.length)) && <RowsTable kind={kind} rows={done.rows.filter((r) => !r.ok || r.notes.length)} />}
            <button className="btn-ghost" onClick={() => reset()}>Add another file</button>
          </>
        )}
      </section>

      <Connections />
    </div>
  );
}

function RowsTable({ kind, rows }: { kind: Kind; rows: Row[] }) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl border border-rule px-4">
      <table className="table">
        <thead className="sticky top-0 bg-card">
          <tr><th>Row</th><th>{kind === "invoices" ? "Customer" : "Supplier"}</th><th>Invoice</th><th>Amount</th><th>Due</th><th>Check</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row}>
              <td className="figure">{r.row}</td>
              <td>{r.who || "—"}</td>
              <td>{r.invoice_no || "—"}</td>
              <td className="figure">{r.amount ?? "—"}</td>
              <td className="whitespace-nowrap">{r.due_date ?? "—"}</td>
              <td className="max-w-sm text-xs">
                {r.ok ? <span className="text-ink">{r.notes.length ? r.notes.join(". ") : "Ready"}</span> : <span className="text-bad">{r.problem}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Connections() {
  const list = useApi<{ connections: { id: string; name: string; last4: string; created_at: string; last_used_at: string | null }[] }>("/api/connections");
  const [name, setName] = useState("");
  const [made, setMade] = useState<{ name: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const act = useAction();
  const when = (t: string) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="card space-y-4">
      <h2 className="h-section">From your AI assistant or software</h2>
      <p className="text-sm text-ink">
        Make a private link and add it to your AI assistant (Claude, ChatGPT or any app that supports MCP connectors) as a custom connector. Then you can ask it things like
        "add invoices for this week's orders" and it creates them here, with the same checks as a spreadsheet. It can read and add invoices and bills. It can't move money or approve suppliers.
      </p>
      <div className="flex max-w-xl flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Name it">
            <input className="input" placeholder="For example: My Claude" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <button
          className="btn"
          disabled={!name.trim() || act.busy}
          onClick={() =>
            act.run(async () => {
              const r = await api<{ link: string }>("/api/connections", { method: "POST", json: { name } });
              setMade({ name, link: r.link });
              setCopied(false);
              setName("");
              await list.reload();
            })
          }
        >
          Make a link
        </button>
      </div>
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      {made && (
        <Notice kind="warn">
          <p className="font-medium">Your link for "{made.name}". Copy it now: it won't be shown again.</p>
          <p className="mt-2 break-all font-mono text-xs">{made.link}</p>
          <button
            className="btn-ghost mt-3"
            onClick={async () => {
              await navigator.clipboard.writeText(made.link);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <p className="mt-3">Keep it private like a password. Anyone with it can add invoices and bills for your business. Remove it below if it gets out.</p>
        </Notice>
      )}
      {!!list.data?.connections.length && (
        <table className="table">
          <thead><tr><th>Connection</th><th>Made</th><th>Last used</th><th></th></tr></thead>
          <tbody>
            {list.data.connections.map((c) => (
              <tr key={c.id}>
                <td>{c.name}<p className="font-mono text-xs text-ink">…{c.last4}</p></td>
                <td>{when(c.created_at)}</td>
                <td>{c.last_used_at ? when(c.last_used_at) : "Not yet"}</td>
                <td className="text-right">
                  <button
                    className="text-xs text-bad"
                    disabled={act.busy}
                    onClick={() =>
                      act.run(async () => {
                        await api("/api/connections", { method: "DELETE", json: { id: c.id } });
                        await list.reload();
                      })
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
