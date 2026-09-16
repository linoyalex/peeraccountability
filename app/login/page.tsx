import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Copy is exact, verbatim from docs/BUILD.md §10 — do not paraphrase or invent strings here.
async function sendMagicLink(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createClient();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  redirect(error ? `/login?error=${encodeURIComponent(error.message)}` : "/login?sent=1");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <p className="font-headline text-sm font-medium uppercase tracking-[0.2em] text-accent">
          Chalkline
        </p>

        <h1 className="mt-6 font-headline text-3xl font-bold leading-tight text-ink">
          Prove it to the people who&apos;d know.
        </h1>

        <p className="mt-3 text-muted">
          One habit. Two mates who back it or call it. Four weeks.
        </p>

        {params.sent ? (
          <p className="mt-8 rounded-lg border border-line bg-white px-4 py-3 text-sm text-ink">
            Check your email for the link.
          </p>
        ) : (
          <form action={sendMagicLink} className="mt-8 space-y-3">
            <input
              type="email"
              name="email"
              required
              placeholder="you@email.com"
              autoComplete="email"
              className="w-full rounded-lg border border-line bg-white px-4 py-3 text-base text-ink outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-3 text-base font-semibold text-white"
            >
              Send me a link
            </button>
          </form>
        )}

        {params.error ? (
          <p className="mt-4 text-sm text-accent">{params.error}</p>
        ) : null}

        <p className="mt-6 text-xs text-muted">
          No password. We email you a link that signs you in.
        </p>
      </div>
    </main>
  );
}
