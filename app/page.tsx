import { createClient } from "@/lib/supabase/server";

// Placeholder only — the real Home screen (streak hero, Prove It, Your call) is Part 6
// (docs/BUILD.md §8/§9). This exists only so a successful sign-in has somewhere to land and be
// observed, per this step's own scope (auth path only).
export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-muted">Signed in as</p>
      <p className="mt-1 font-headline text-xl font-bold text-ink">
        {(data?.claims as { email?: string } | undefined)?.email ?? "unknown"}
      </p>
      <p className="mt-6 text-sm text-muted">Home screen lands in Part 6.</p>
    </main>
  );
}
