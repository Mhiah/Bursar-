import { headers } from "next/headers";
import { handler } from "@/lib/api";
import { loginMessage } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = handler(async () => loginMessage((await headers()).get("host") ?? "bursar"));
