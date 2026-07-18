import NextAuth from "next-auth";
import { NextResponse } from "next/server";

const { auth } = NextAuth({
  providers: [],
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  // Host validation is delegated to the reverse proxy (Caddy); without this
  // Auth.js throws UntrustedHost in the edge middleware and fails open.
  trustHost: true,
});

export default auth((request) => {
  const developmentBypass =
    process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS !== "0";
  if (developmentBypass || request.auth) return NextResponse.next();
  const signInUrl = new URL("/signin", request.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    "/creator/:path*",
    "/hotspots/:path*",
    "/ideas/:path*",
    "/publish/:path*",
    "/retrospectives/:path*",
    "/personas/:path*",
    "/tasks/:path*",
    "/settings/:path*",
  ],
};
