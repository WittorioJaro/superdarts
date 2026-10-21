import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=sign_in_failed`);

  if (!isEmailAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_invited`);
  }

  // Back to the page that sent them to sign in, e.g. a room invite. Same-site paths only.
  const jar = await cookies();
  const next = jar.get("sd_next")?.value;
  jar.delete("sd_next");
  const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  return NextResponse.redirect(`${origin}${safe}`);
}
