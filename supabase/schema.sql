-- Chalkline v1 — schema
-- Draft only. Not run against the project yet — see docs/BUILD.md §5 and the walkthrough that
-- accompanies this file. Confirmed against the live project via the Supabase MCP (read-only):
-- public schema is currently empty, pgcrypto is installed in the `extensions` schema.

-- ============================================================================
-- profiles — mirrors auth.users
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- Trigger firing never requires the firing role to hold EXECUTE on the function, so revoking
-- from every role (not just `public`) removes this from being directly RPC-callable at all
-- without affecting the trigger. `revoke ... from public` alone is NOT enough on its own — see
-- the note by set_proof_submission_fields below for why.
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- habits — one per user
-- ============================================================================

create table public.habits (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null,
  start_date date not null,
  schedule_type text not null
    check (schedule_type in ('daily', 'weekdays_fixed', 'days_per_week_floating')),
  -- shape depends on schedule_type; validated in app code via a zod discriminated union, not here
  -- (docs/BUILD.md §5): {} for daily, {"weekdays": int[]} for weekdays_fixed (0=Sunday),
  -- {"days_per_week": int} (1-6) for days_per_week_floating.
  schedule_config jsonb not null default '{}'::jsonb
);

alter table public.habits enable row level security;

-- ============================================================================
-- corner_members — hand-seeded witness pairs, never written by clients
-- ============================================================================

create table public.corner_members (
  subject_id uuid not null references public.profiles (id) on delete cascade,
  witness_id uuid not null references public.profiles (id) on delete cascade,
  primary key (subject_id, witness_id),
  check (subject_id <> witness_id)
);

-- the primary key covers subject_id; witness_id (the other direction is_related_or_self queries)
-- has no covering index without this — flagged by Supabase's performance advisor
create index corner_members_witness_id_idx on public.corner_members (witness_id);

alter table public.corner_members enable row level security;

-- ============================================================================
-- proofs
-- ============================================================================

create table public.proofs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  -- server-computed at insert (never a generated column — timezone math isn't IMMUTABLE)
  app_day date not null,
  submitted_at timestamptz not null default now(),
  photo_path text not null,
  note text,
  status text not null default 'waiting'
    check (status in ('waiting', 'backed', 'broken')),
  resolution text
    check (resolution in ('votes', 'no_response')),
  resolved_at timestamptz
);

-- allows re-posts after a `broken` day, blocks duplicates otherwise
create unique index proofs_one_active_per_user_day
  on public.proofs (user_id, app_day)
  where status in ('waiting', 'backed');

-- habit_id's foreign key has no covering index — flagged by Supabase's performance advisor
create index proofs_habit_id_idx on public.proofs (habit_id);

alter table public.proofs enable row level security;

-- Forces submitted_at/app_day to the server's own clock, discarding whatever the client sent for
-- either column. This is the real enforcement of "never trust a client timestamp" (docs/BUILD.md
-- §8) — postProof computing these itself in app code is only a convenience for the normal path; a
-- client calling the REST API directly would otherwise be able to backdate submitted_at, get
-- resolve_stale() to immediately auto-clear it, and self-back an arbitrary streak (or overturn a
-- corner's `call` by re-posting for the same day). RLS alone can't close that without this
-- trigger, since a WITH CHECK only validates values, it can't compute them the way a trigger can.
--
-- Only refreshes on INSERT, or on an UPDATE that's still a genuine client re-post (old and new
-- status both 'waiting' — restarts the 36h window, matching "update in place"). It does NOT
-- refresh when cast_vote()/resolve_stale_proof() flip status to backed/broken: those updates
-- preserve the original submitted_at/app_day. Without that distinction, resolving a proof written
-- late in the day would push its app_day forward, collide with the next day's proof under
-- proofs_one_active_per_user_day, and abort the whole resolve_all_stale_proofs() sweep — and it
-- would destroy the voted_at/submitted_at gap that pilot-scope.md §A1 exists to measure.
--
-- This intentionally duplicates one line of appDay.ts's logic in SQL. Unlike streak/best-run
-- (real branching logic, not duplicated on purpose), this is a single, narrow, mechanical
-- calculation — if the day-boundary rule ever changes, change it here and in appDay.ts together.
create or replace function public.set_proof_submission_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- OLD has no tuple on INSERT, so `old.status` is only ever referenced inside a branch that
  -- only runs on UPDATE — never combined with tg_op = 'INSERT' in the same boolean expression,
  -- which would be a version-dependent hazard (record "old" is not assigned yet on some builds).
  if tg_op = 'UPDATE' then
    if old.status = 'waiting' and new.status = 'waiting' then
      new.submitted_at := now();
      new.app_day := (
        date_trunc('day', (new.submitted_at at time zone 'America/New_York') - interval '4 hours')
      )::date;
    else
      new.submitted_at := old.submitted_at;
      new.app_day := old.app_day;
    end if;
  else
    new.submitted_at := now();
    new.app_day := (
      date_trunc('day', (new.submitted_at at time zone 'America/New_York') - interval '4 hours')
    )::date;
  end if;
  return new;
end;
$$;

-- Supabase auto-grants EXECUTE on every new public-schema function to anon/authenticated/
-- service_role via a project-level default ACL (`pg_default_acl`) — confirmed live on this
-- project. `revoke ... from public` alone does NOT undo that; each role needs an explicit revoke.
-- Same trigger-firing note as handle_new_user above.
revoke execute on function public.set_proof_submission_fields()
  from public, anon, authenticated, service_role;

drop trigger if exists proofs_set_submission_fields on public.proofs;
create trigger proofs_set_submission_fields
  before insert or update on public.proofs
  for each row execute function public.set_proof_submission_fields();

-- ============================================================================
-- votes
-- ============================================================================

create table public.votes (
  id uuid primary key default extensions.gen_random_uuid(),
  proof_id uuid not null references public.proofs (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  vote text not null check (vote in ('back', 'call')),
  -- pilot-scope.md §A1 — the only way to measure witness response-time drift over the 4 weeks
  voted_at timestamptz not null default now(),
  unique (proof_id, voter_id)
);

-- unique(proof_id, voter_id) covers lookups by proof_id but not by voter_id alone; voter_id's
-- foreign key has no covering index without this — flagged by Supabase's performance advisor
create index votes_voter_id_idx on public.votes (voter_id);

alter table public.votes enable row level security;

-- ============================================================================
-- helper — used by RLS policies in policies.sql
-- ============================================================================

create or replace function public.is_related_or_self(a uuid, b uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select a = b
    or exists (
      select 1 from public.corner_members cm
      where (cm.subject_id = a and cm.witness_id = b)
         or (cm.subject_id = b and cm.witness_id = a)
    );
$$;

-- Must stay callable by `authenticated` — every self-or-corner SELECT policy in policies.sql
-- calls this from its USING clause, so revoking execute here would break every one of those
-- policies, not just direct RPC calls to this function.
grant execute on function public.is_related_or_self(uuid, uuid) to authenticated;

-- ============================================================================
-- cast_vote — the only way votes get written; SECURITY DEFINER to bypass the
-- deliberate no-insert-grant on votes, but re-checks authorization itself.
-- ============================================================================

create or replace function public.cast_vote(p_proof_id uuid, p_vote text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
  v_status text;
  v_back_count int;
  v_call_count int;
begin
  if p_vote is null or p_vote not in ('back', 'call') then
    raise exception 'invalid vote';
  end if;

  select user_id, status into v_subject_id, v_status
  from public.proofs
  where id = p_proof_id
  for update;

  if v_subject_id is null then
    raise exception 'proof not found';
  end if;

  -- authorization is checked before the resolved/waiting check, so a caller can't use the error
  -- message to tell "exists and already resolved" apart from "not authorized" for a proof they
  -- have no relationship to
  if not exists (
    select 1 from public.corner_members
    where subject_id = v_subject_id and witness_id = auth.uid()
  ) then
    raise exception 'not authorized to vote on this proof';
  end if;

  if v_status <> 'waiting' then
    raise exception 'proof already resolved';
  end if;

  begin
    insert into public.votes (proof_id, voter_id, vote)
    values (p_proof_id, auth.uid(), p_vote);
  exception when unique_violation then
    raise exception 'you already voted on this proof';
  end;

  select
    count(*) filter (where vote = 'back'),
    count(*) filter (where vote = 'call')
  into v_back_count, v_call_count
  from public.votes
  where proof_id = p_proof_id;

  -- exactly two, not a majority. With a fixed 2-person corner this never sees a third voter, but
  -- if it ever did, the counts would already be >= 2 and the proof already resolved above.
  if v_back_count >= 2 then
    update public.proofs
    set status = 'backed', resolution = 'votes', resolved_at = now()
    where id = p_proof_id;
  elsif v_call_count >= 2 then
    update public.proofs
    set status = 'broken', resolution = 'votes', resolved_at = now()
    where id = p_proof_id;
  end if;
end;
$$;

revoke execute on function public.cast_vote(uuid, text) from public, anon;
grant execute on function public.cast_vote(uuid, text) to authenticated;

-- ============================================================================
-- resolve_stale_proof — resolves ONE proof if it's actually stale. Internal
-- building block for resolve_stale() (per-user backstop) and
-- resolve_all_stale_proofs() (cron sweep) below. Not granted to any client role.
-- ============================================================================

create or replace function public.resolve_stale_proof(p_proof_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_submitted_at timestamptz;
begin
  select status, submitted_at into v_status, v_submitted_at
  from public.proofs
  where id = p_proof_id
  for update;

  if v_status = 'waiting' and v_submitted_at < now() - interval '36 hours' then
    -- the day still counts (matches spec: "punishing you for a slow mate would lose us both") —
    -- only `resolution` distinguishes this from a real consensus back
    update public.proofs
    set status = 'backed', resolution = 'no_response', resolved_at = now()
    where id = p_proof_id;
  end if;
end;
$$;

-- Must be revoked from `authenticated` explicitly, not just `public` — Supabase's default ACL
-- (see the cast_vote note above) grants execute to authenticated on every new function by
-- default, and this one must never be directly callable by a client, only via resolve_stale()
-- and resolve_all_stale_proofs() below.
revoke execute on function public.resolve_stale_proof(uuid) from public, anon, authenticated;

-- ============================================================================
-- resolve_stale — Home-load backstop, scoped to the calling user's own
-- subject/witness proofs only (not a global sweep).
-- ============================================================================

create or replace function public.resolve_stale()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof_id uuid;
begin
  for v_proof_id in
    select p.id
    from public.proofs p
    where p.status = 'waiting'
      and p.submitted_at < now() - interval '36 hours'
      and (
        p.user_id = auth.uid()
        or exists (
          select 1 from public.corner_members cm
          where cm.subject_id = p.user_id and cm.witness_id = auth.uid()
        )
      )
  loop
    perform public.resolve_stale_proof(v_proof_id);
  end loop;
end;
$$;

revoke execute on function public.resolve_stale() from public, anon;
grant execute on function public.resolve_stale() to authenticated;

-- ============================================================================
-- resolve_all_stale_proofs — cron sweep, called from /api/cron/resolve-proofs
-- using the server-side (secret-key) client, never by an `authenticated` user.
-- ============================================================================

create or replace function public.resolve_all_stale_proofs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof_id uuid;
begin
  for v_proof_id in
    select id from public.proofs
    where status = 'waiting' and submitted_at < now() - interval '36 hours'
  loop
    perform public.resolve_stale_proof(v_proof_id);
  end loop;
end;
$$;

-- Same default-ACL caveat as resolve_stale_proof above — authenticated must be revoked
-- explicitly, or Supabase's default grant leaves this callable directly by any signed-in user
-- instead of only the cron route (which uses the secret/service_role key).
revoke execute on function public.resolve_all_stale_proofs() from public, anon, authenticated;
grant execute on function public.resolve_all_stale_proofs() to service_role;

-- ============================================================================
-- best_run(): DELIBERATELY NOT IMPLEMENTED HERE — see the walkthrough notes.
-- Computing the true longest-ever run in SQL means re-deriving streak.ts's
-- day-by-day (daily/weekdays_fixed) and week-by-week (days_per_week_floating)
-- walk logic a second time, in a different language, with a real chance the two
-- silently disagree. Best-run is computed in app code instead, reusing
-- streak.ts, from a plain SELECT of a habit's proof history.
-- ============================================================================
