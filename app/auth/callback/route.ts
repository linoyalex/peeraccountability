import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Exchanges the magic-link code for a session, then redirects home. proxy.ts's PUBLIC_PATHS
// list must include this route's prefix, or the redirect it issues gets redirected right back
// here by the proxy before the exchange ever runs.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
