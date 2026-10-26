import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

// `/t` is the pub table: a one-time code from a signed-in phone is its only way in.
const PUBLIC_PATHS = ["/login", "/auth", "/cam", "/privacy", "/terms", "/t"];
const NEXT_COOKIE = "sd_next";

/** Keeps the Supabase session fresh and sends signed-out visitors to the login screen. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;

  if (!data?.claims && !PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url);
    // Invite links must survive the Google round trip, so remember where the visitor was going.
    if (path !== "/") res.cookies.set(NEXT_COOKIE, path + request.nextUrl.search, { path: "/", maxAge: 900, sameSite: "lax", httpOnly: true });
    return res;
  }

  return response;
}

export const config = {
  // The caller's clips are public files that pub tables need without a session, so they skip the proxy too.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|pwa-icon|caller/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
