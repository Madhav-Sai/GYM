import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie -> /login. The API still verifies the token on every call.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("gym_session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!api|_next|login|favicon.ico).*)"] };
