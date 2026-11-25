import { NextResponse, type NextRequest } from "next/server";

// Bursar moved to a new domain. Visits to the old one get a short "moved" page that links to the same
// page on the new domain (pay links included). The API keeps working on the old domain for now.
const NEW_ORIGIN = process.env.NEW_ORIGIN || "https://bursar.me";
const OLD_HOSTS = (process.env.OLD_HOSTS || "bursar.myacxt.site").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (!OLD_HOSTS.includes(host)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/moved";
  url.search = `?to=${encodeURIComponent(NEW_ORIGIN + req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.rewrite(url);
}

// Pages only: not the API, Next's own files or the icons.
export const config = { matcher: ["/((?!api/|_next/|favicon\\.ico|icon\\.svg|apple-icon\\.png|fonts/).*)"] };
