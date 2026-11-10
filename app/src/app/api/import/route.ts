import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { checkImport, fromSheet, ImportError, MAX_ROWS, runImport } from "@/lib/bulk";

export const dynamic = "force-dynamic";

const Input = z.object({
  kind: z.enum(["invoices", "bills"]),
  /** Spreadsheet rows: heading -> cell. */
  records: z.array(z.record(z.unknown())).max(MAX_ROWS, `Add at most ${MAX_ROWS} rows at a time.`),
  /** false = only check and show what would happen. */
  create: z.boolean().default(false),
});

export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  const r = await body(req, Input);
  const rows = fromSheet(r.kind, r.records);
  try {
    return r.create ? await runImport(b, r.kind, rows, "a spreadsheet") : await checkImport(b, r.kind, rows);
  } catch (e) {
    if (e instanceof ImportError) throw new HttpError(400, e.message);
    throw e;
  }
});
