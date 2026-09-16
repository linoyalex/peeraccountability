import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  isAllowedDevLoginEmail,
  isLocalDevelopmentRequest,
  parseDevLoginEmails,
} from "@/lib/devLogin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireLocalDevelopmentLogin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const allowedEmails = parseDevLoginEmails(process.env.DEV_TEST_USER_EMAILS);

  if (!isLocalDevelopmentRequest(host, process.env.NODE_ENV) || allowedEmails.length === 0) {
    notFound();
  }

  return allowedEmails;
}

async function devLogin(formData: FormData) {
  "use server";

  const allowedEmails = await requireLocalDevelopmentLogin();
  const email = isAllowedDevLoginEmail(formData.get("email"), allowedEmails);
  if (!email) {
    redirect("/dev-login?error=invalid_user");
  }

  const generated = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (generated.error) {
    redirect("/dev-login?error=generate_failed");
  }

  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({
    token_hash: generated.data.properties.hashed_token,
    type: "email",
  });
  if (verified.error) {
    redirect("/dev-login?error=verify_failed");
  }

  redirect("/");
}

const errorMessages: Record<string, string> = {
  invalid_user: "That test user is not allowed.",
  generate_failed: "Couldn’t generate a local test session.",
  verify_failed: "Couldn’t verify the local test session.",
};

export default async function DevLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const allowedEmails = await requireLocalDevelopmentLogin();
  const { error } = await searchParams;

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="font-headline text-sm font-medium uppercase tracking-[0.2em] text-accent">
          Local testing only
        </p>
        <h1 className="mt-5 font-headline text-3xl font-bold text-ink">Choose a test user</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This creates a real Supabase session without sending an email. Open this page in a
          separate browser profile for each squad member.
        </p>

        {error && errorMessages[error] ? (
          <p role="alert" className="mt-5 rounded-xl border border-accent px-4 py-3 text-sm text-accent">
            {errorMessages[error]}
          </p>
        ) : null}

        <div className="mt-7 space-y-3">
          {allowedEmails.map((email) => (
            <form action={devLogin} key={email}>
              <button
                type="submit"
                name="email"
                value={email}
                className="min-h-14 w-full rounded-2xl bg-ink px-5 text-left text-sm font-bold text-white"
              >
                Continue as {email}
              </button>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}
