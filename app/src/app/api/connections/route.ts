import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { createConnection, listConnections, revokeConnection } from "@/lib/connections";
import { logDecision } from "@/lib/decisions";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const b = await requireBusiness();
  return { connections: await listConnections(b.id) };
});

export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(60) }));
  let made;
  try {
    made = await createConnection(b.id, name);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : String(e));
  }
  await logDecision(b.id, "note", `Connection "${name}" made`, "It can read customers, suppliers, invoices and bills and add invoices and bills. It can't move money or approve suppliers.", { connection: made.id });
  const origin = new URL(req.url).origin;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return { id: made.id, link: `${host ? `${proto}://${host}` : origin}/api/mcp/${made.key}` };
});

export const DELETE = handler(async (req: Request) => {
  const b = await requireBusiness();
  const { id } = await body(req, z.object({ id: z.string() }));
  if (!(await revokeConnection(b.id, id))) throw new HttpError(404, "Connection not found.");
  await logDecision(b.id, "note", "Connection removed", "Its link no longer works.", { connection: id });
  return { ok: true };
});
