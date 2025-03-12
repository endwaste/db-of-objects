import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // 2. Check if there's a cookie named "token"
  const token = req.cookies.get("token")?.value;
  
  // 3. If no token, redirect to /login
  if (!token) {
    // Build a URL object so we can set the path
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // 4. If we have a token, let the user continue
  return NextResponse.next();
}
