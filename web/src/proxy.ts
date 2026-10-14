import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_HOST = "snimok.xyz";
/** Hosts that serve this app but must not compete with snimok.xyz in search. */
const ALIASES = new Set(["www.snimok.xyz", "snimok-ten.vercel.app"]);

/**
 * One public address: page requests on an alias host get a permanent redirect
 * to snimok.xyz. API calls are left alone (an older desktop build could still
 * POST to an alias, and redirects would turn uploads into GETs). Preview
 * deployments (other *.vercel.app hosts) keep working as they are.
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  if (!ALIASES.has(host)) return NextResponse.next();
  if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.next();
  const url = req.nextUrl.clone();
  url.protocol = "https:";
  url.host = CANONICAL_HOST;
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Everything except API routes and Next's own assets.
  matcher: ["/((?!api/|_next/|favicon.ico).*)"],
};
