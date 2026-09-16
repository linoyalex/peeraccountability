---
paths: ["supabase/**", "app/**/actions.ts", "lib/supabase/**"]
---

- RLS is mandatory on every table — no exceptions, no "we'll add it later."
- Never use the secret key (`sb_secret_...`, or a legacy `service_role` key) in anything that reaches the browser.
- Every storage URL handed to a client is a signed URL — the `proofs` bucket is private, never public.
- State-changing operations that need atomicity go through a `SECURITY DEFINER` SQL function with row locking, not a client-side update — see `docs/BUILD.md` §6.
