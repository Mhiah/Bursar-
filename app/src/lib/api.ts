import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { currentBusiness, type Business } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireBusiness(): Promise<Business> {
  const b = await currentBusiness();
  if (!b) throw new HttpError(401, "Sign in first.");
  return b;
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  try {
    return schema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) throw new HttpError(400, e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
    throw new HttpError(400, "Invalid request body.");
  }
}

/** Wrap a route handler so thrown errors become JSON responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      // Library errors can include the private RPC URL (and its key); never send URLs back.
      const msg = (e instanceof Error ? e.message : "Something went wrong.").replace(/URL:.*$/gm, "").replace(/https?:\/\/\S+/g, "[hidden]").trim();
      const dup = /duplicate key|unique constraint/i.test(msg);
      return NextResponse.json({ error: dup ? "That already exists." : msg }, { status: dup ? 409 : 500 });
    }
  };
}
