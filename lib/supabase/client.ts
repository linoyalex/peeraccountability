import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client — uses the publishable key, safe to expose to the client.
// Never import this from server-only code; use lib/supabase/server.ts there instead.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
