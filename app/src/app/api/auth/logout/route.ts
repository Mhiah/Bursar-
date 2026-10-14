import { handler } from "@/lib/api";
import { clearSession } from "@/lib/session";

export const POST = handler(async () => {
  await clearSession();
  return { ok: true };
});
