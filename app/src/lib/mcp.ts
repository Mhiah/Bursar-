import { checkImport, ImportError, MAX_ROWS, runImport, type Kind } from "./bulk";
import { businessForKey } from "./connections";
import { q } from "./db";
import { fromUnits } from "./money";
import type { Business } from "./session";

/**
 * Bursar as an MCP server: a business connects its own AI assistant (Claude, ChatGPT and others)
 * or its own software with a secret link, and can then read its customers, suppliers, invoices
 * and bills and add invoices and bills in bulk. Nothing here moves money: bills it adds are paid
 * by the agent only inside the vault's rules, and new suppliers need the owner's approval first.
 *
 * Streamable HTTP, stateless: every request is a JSON-RPC POST answered with plain JSON.
 */

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const invoiceItem = {
  type: "object",
  properties: {
    customer: { type: "string", description: "Customer name. Matched to an existing customer by name; a new name adds a new customer." },
    customer_email: { type: "string", description: "Optional. Used only when the customer is new." },
    invoice_no: { type: "string", description: "Your invoice number. Must be new." },
    amount: { type: "string", description: "Amount in USDC, for example \"25\" or \"12.50\"." },
    due_date: { type: "string", description: "Due date, YYYY-MM-DD." },
    description: { type: "string", description: "Optional. What it's for." },
  },
  required: ["customer", "invoice_no", "amount", "due_date"],
};

const billItem = {
  type: "object",
  properties: {
    supplier: { type: "string", description: "Supplier name. Matched to an existing supplier by name." },
    supplier_wallet: { type: "string", description: "Needed only for a new supplier. Must match the saved wallet for an existing one." },
    supplier_email: { type: "string", description: "Optional. Used only when the supplier is new." },
    invoice_no: { type: "string", description: "The supplier's invoice number." },
    amount: { type: "string", description: "Amount in USDC." },
    due_date: { type: "string", description: "Due date, YYYY-MM-DD." },
    category: { type: "string", description: "Optional budget category. Defaults to the supplier's." },
    expected_amount: { type: "string", description: "Optional agreed amount from the quote or order. A mismatch gets flagged." },
    description: { type: "string", description: "Optional. What it's for." },
  },
  required: ["supplier", "invoice_no", "amount", "due_date"],
};

const checkOnly = { type: "boolean", description: "true = only check the rows and say what would happen, without adding anything." };

const TOOLS = [
  {
    name: "list_customers",
    description: "The business's customers in Bursar, with how much each still owes.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_suppliers",
    description: "The business's suppliers in Bursar, with their wallet and budget category.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_invoices",
    description: "Invoices the business sent its customers, newest first, with each one's pay link.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["open", "part_paid", "paid", "cancelled"], description: "Optional filter." } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_bills",
    description: "Bills from suppliers, newest first, with their status and any checks flagged.",
    inputSchema: { type: "object", properties: { status: { type: "string", description: "Optional filter, for example new, scheduled, held, awaiting_approval, paid." } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_invoices",
    description: `Add up to ${MAX_ROWS} customer invoices at once. Each one gets a pay link and the agent chases it like any other. Rows that fail a check (repeated invoice number, bad amount or date) are skipped and explained.`,
    inputSchema: { type: "object", properties: { invoices: { type: "array", items: invoiceItem, maxItems: MAX_ROWS }, check_only: checkOnly }, required: ["invoices"] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "create_bills",
    description: `Add up to ${MAX_ROWS} supplier bills at once. The agent pays them only inside the vault's rules; a new supplier can't be paid until the owner approves their wallet. A bill already added is never added twice, and an import can't change a supplier's saved wallet.`,
    inputSchema: { type: "object", properties: { bills: { type: "array", items: billItem, maxItems: MAX_ROWS }, check_only: checkOnly }, required: ["bills"] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };
class RpcError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

const result = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

async function callTool(b: Business, origin: string, via: string, name: string, args: any) {
  switch (name) {
    case "list_customers": {
      const rows = await q(
        `SELECT c.name, c.email, coalesce(sum(r.amount - r.paid_amount) FILTER (WHERE r.status IN ('open','part_paid')), 0)::text AS owes
         FROM customers c LEFT JOIN payment_requests r ON r.customer_id = c.id WHERE c.business_id = $1 GROUP BY c.id ORDER BY c.name`,
        [b.id],
      );
      return result({ customers: rows.map((r) => ({ name: r.name, email: r.email, owes_usdc: fromUnits(r.owes) })) });
    }
    case "list_suppliers": {
      const rows = await q("SELECT name, email, wallet_address, category FROM suppliers WHERE business_id = $1 ORDER BY name", [b.id]);
      return result({ suppliers: rows });
    }
    case "list_invoices": {
      const rows = await q(
        `SELECT r.id, r.invoice_no, c.name AS customer, r.amount, r.paid_amount, r.due_date, r.status, r.description
         FROM payment_requests r JOIN customers c ON c.id = r.customer_id
         WHERE r.business_id = $1 AND ($2::text IS NULL OR r.status = $2) ORDER BY r.created_at DESC LIMIT 200`,
        [b.id, args?.status ?? null],
      );
      return result({
        invoices: rows.map((r) => ({
          invoice_no: r.invoice_no, customer: r.customer, amount_usdc: fromUnits(r.amount), paid_usdc: fromUnits(r.paid_amount),
          due_date: String(r.due_date).slice(0, 10), status: r.status, description: r.description, pay_link: `${origin}/pay/${r.id}`,
        })),
      });
    }
    case "list_bills": {
      const rows = await q(
        `SELECT bl.invoice_no, s.name AS supplier, bl.amount, bl.due_date, bl.status, bl.category, bl.flags, bl.paid_tx
         FROM bills bl JOIN suppliers s ON s.id = bl.supplier_id
         WHERE bl.business_id = $1 AND ($2::text IS NULL OR bl.status = $2) ORDER BY bl.created_at DESC LIMIT 200`,
        [b.id, args?.status ?? null],
      );
      return result({
        bills: rows.map((r) => ({
          invoice_no: r.invoice_no, supplier: r.supplier, amount_usdc: fromUnits(r.amount), due_date: String(r.due_date).slice(0, 10),
          status: r.status, category: r.category, checks: (r.flags ?? []).map((f: any) => f.detail), paid_tx: r.paid_tx,
        })),
      });
    }
    case "create_invoices":
    case "create_bills": {
      const kind: Kind = name === "create_invoices" ? "invoices" : "bills";
      const rows = args?.[kind];
      if (!Array.isArray(rows)) return result(`Give the ${kind} as a list.`, true);
      if (rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) return result(`Each of the ${kind} must be an object.`, true);
      try {
        const out = args?.check_only ? await checkImport(b, kind, rows) : await runImport(b, kind, rows, via);
        return result({
          added: out.created,
          skipped: out.skipped,
          check_only: !!args?.check_only,
          rows: out.rows.map((r) => ({ row: r.row, invoice_no: r.invoice_no, who: r.who, ok: r.ok, ...(r.problem ? { problem: r.problem } : {}), ...(r.notes.length ? { notes: r.notes } : {}), ...(kind === "invoices" && r.id ? { pay_link: `${origin}/pay/${r.id}` } : {}) })),
        });
      } catch (e) {
        if (e instanceof ImportError) return result(e.message, true);
        throw e;
      }
    }
    default:
      throw new RpcError(-32602, `Unknown tool: ${name}`);
  }
}

async function answer(b: Business, origin: string, via: string, m: Rpc) {
  switch (m.method) {
    case "initialize": {
      const asked = m.params?.protocolVersion;
      return {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "bursar", title: "Bursar", version: "1.0.0" },
        instructions: `You're connected to ${b.name}'s Bursar account. Use list_customers or list_suppliers to see the names already saved, then create_invoices or create_bills to add many at once. Use check_only first when unsure. Amounts are in USDC, dates are YYYY-MM-DD.`,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      return callTool(b, origin, via, m.params?.name, m.params?.arguments ?? {});
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };
    default:
      throw new RpcError(-32601, `Method not found: ${m.method}`);
  }
}

const json = (data: unknown, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status, headers: data == null ? {} : { "content-type": "application/json" } });

/** Answers one MCP request. The key comes from the link or an "Authorization: Bearer" header. */
export async function handleMcp(req: Request, keyFromPath?: string): Promise<Response> {
  if (req.method === "GET") return new Response("This is a Bursar MCP link. Add it to your AI assistant as a custom connector.", { status: 405, headers: { allow: "POST" } });
  if (req.method === "DELETE") return json(null, 204);
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });

  const header = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const found = await businessForKey(keyFromPath || header || "");
  if (!found) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "This Bursar link isn't valid or was removed. Make a new one in Bursar." } }, 401);

  let msg: Rpc | Rpc[];
  try {
    msg = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const url = new URL(req.url);
  const origin = `${req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host}`;
  const via = `the "${found.connection.name}" connection`;

  const one = async (m: Rpc) => {
    // Notifications (no id) get no answer.
    if (m?.id === undefined || m?.id === null) return null;
    try {
      return { jsonrpc: "2.0", id: m.id, result: await answer(found.business, origin, via, m) };
    } catch (e) {
      if (e instanceof RpcError) return { jsonrpc: "2.0", id: m.id, error: { code: e.code, message: e.message } };
      console.error(e);
      return { jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "Something went wrong in Bursar." } };
    }
  };

  if (Array.isArray(msg)) {
    const out = [];
    for (const m of msg) {
      const r = await one(m);
      if (r) out.push(r);
    }
    return out.length ? json(out) : json(null, 202);
  }
  const out = await one(msg);
  return out ? json(out) : json(null, 202);
}
