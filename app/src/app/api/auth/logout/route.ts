import { handler } from "@/lib/api";
import { clearSession } from "@/lib/session";

export const POST = handler(async () => {
  clearSession();
  return { ok: true };
});
