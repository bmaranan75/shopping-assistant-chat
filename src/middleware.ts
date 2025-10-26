import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request);

  // Authentication routes — let the Auth0 middleware handle it.
  if (request.nextUrl.pathname.startsWith("/auth")) {
    return authRes;
  }

  // API routes that handle their own authentication (like checkout)
  if (request.nextUrl.pathname.startsWith("/api/checkout")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/add-payment")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/add-to-cart")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/delete-cart")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/catalog")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/get-cart")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/inlinehook")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/chat")) {
    return NextResponse.next();
  }

  // MCP routes use their own authentication (MCP_API_KEY)
  if (request.nextUrl.pathname.startsWith("/api/mcp")) {
    return NextResponse.next();
  }

  const { origin } = new URL(request.url);
  const session = await auth0.getSession(request);

  // User does not have a session — redirect to login.
  if (!session) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }
  return authRes;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image, images (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - $ (root)
     */
    "/((?!_next/static|_next/image|images|favicon.[ico|png]|sitemap.xml|robots.txt|$).*)",
  ],
};