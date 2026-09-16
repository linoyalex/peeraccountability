import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client for Server Components, Server Actions, and Route Handlers.
// Reads/writes the session via cookies — never trust anything from this client's auth state
// without going through getClaims()/getUser(), never getSession() alone (docs/BUILD.md §7).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, which can't set cookies. Safe to ignore as long as
            // proxy.ts is also refreshing the session on every request.
          }
        },
      },
    },
  );
}
