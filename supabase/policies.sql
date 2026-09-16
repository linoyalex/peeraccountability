-- Chalkline v1 — RLS policies
-- Draft only. Run schema.sql first. See docs/BUILD.md §6 and the walkthrough that accompanies
-- this file. RLS is already enabled on every table in schema.sql; this file only adds policies.

-- ============================================================================
-- profiles — self, or anyone you're a subject/witness pair with
-- ============================================================================

create policy "profiles_select_self_or_corner"
  on public.profiles
  for select
  to authenticated
  using (public.is_related_or_self(auth.uid(), id));

-- No insert/update/delete policy: the handle_new_user() trigger (SECURITY DEFINER) is the only
-- writer. A client can never insert or edit a profiles row directly.

-- ============================================================================
-- habits — same self-or-corner visibility (a witness needs to see the habit
-- name on their "Your call" card)
-- ============================================================================

create policy "habits_select_self_or_corner"
  on public.habits
  for select
  to authenticated
  using (public.is_related_or_self(auth.uid(), user_id));

-- No insert/update/delete policy: habits are hand-seeded (docs/BUILD.md §14), not created via the
-- app in v1 — the Setup screen is explicitly out of scope (§16).

-- ============================================================================
-- corner_members — each person can see only the pairs they're part of
-- ============================================================================

create policy "corner_members_select_self"
  on public.corner_members
  for select
  to authenticated
  using (auth.uid() = subject_id or auth.uid() = witness_id);

-- No insert/update/delete policy: hand-seeded via the SQL editor (as postgres, which bypasses
-- RLS), never via the app.

-- ============================================================================
-- proofs
-- ============================================================================

create policy "proofs_select_self_or_corner"
  on public.proofs
  for select
  to authenticated
  using (public.is_related_or_self(auth.uid(), user_id));

-- A subject can create their own proof, but only in the initial `waiting` state — never
-- pre-resolved. submitted_at/app_day aren't constrained here because the
-- proofs_set_submission_fields trigger (schema.sql) overwrites both before this check runs,
-- regardless of what the client sends. habit_id and photo_path ARE constrained here — without
-- these, a client could post a proof against someone else's habit_id, or set photo_path to
-- another user's storage folder and have the server mint a signed URL for their photo.
create policy "proofs_insert_own"
  on public.proofs
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'waiting'
    and resolution is null
    and resolved_at is null
    and habit_id in (select h.id from public.habits h where h.user_id = auth.uid())
    and photo_path like (auth.uid()::text || '/%')
  );

-- Lets postProof "update in place" (re-send a photo/note for today's still-open proof) without
-- opening a path to self-resolve. A client can touch a row only while it's still `waiting`, and
-- the WITH CHECK blocks the update from changing status/resolution itself — only cast_vote() and
-- resolve_stale_proof() (both SECURITY DEFINER, run as postgres) can actually resolve a proof.
-- Same habit_id/photo_path constraints as the insert policy, for the same reason.
create policy "proofs_update_own_while_waiting"
  on public.proofs
  for update
  to authenticated
  using (user_id = auth.uid() and status = 'waiting')
  with check (
    user_id = auth.uid()
    and status = 'waiting'
    and resolution is null
    and resolved_at is null
    and habit_id in (select h.id from public.habits h where h.user_id = auth.uid())
    and photo_path like (auth.uid()::text || '/%')
  );

-- No delete policy: no client deletes, ever.

-- ============================================================================
-- votes — read-only to clients; all writes go through cast_vote()
-- ============================================================================

-- Scoped to the PROOF'S SUBJECT, not the voter — visibility follows who the vote is about, not
-- who cast it. Keying off voter_id instead (an earlier draft's bug) both over-grants (anyone
-- related to a voter could read every vote that voter ever cast, on anyone's proofs) and
-- under-grants (two witnesses of the same subject aren't necessarily related to *each other*, so
-- one couldn't see the other's vote on their shared subject's proof — breaking the "1 of 2 votes
-- in" state on the Your call card).
create policy "votes_select_self_or_corner"
  on public.votes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.proofs p
      where p.id = votes.proof_id
        and public.is_related_or_self(auth.uid(), p.user_id)
    )
  );

-- No insert/update/delete policy at all. Combined with no INSERT/UPDATE grant on this table,
-- the only way a vote is ever written is cast_vote() (SECURITY DEFINER, re-checks the caller is
-- actually a witness for the proof's subject before inserting).

revoke insert, update, delete on public.votes from authenticated, anon;
revoke delete on public.proofs from authenticated, anon;
revoke insert, update on public.proofs from anon;
revoke insert, update, delete on public.profiles, public.habits, public.corner_members from anon;

-- ============================================================================
-- Storage — the `proofs` bucket itself is created via the dashboard (SETUP.md
-- Part 4, "Storage -> New bucket -> proofs, private"), not SQL. These are its
-- policies once that bucket exists.
-- ============================================================================

create policy "proof_photos_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Needed for postProof's "update in place" re-post (docs/BUILD.md §8) if it overwrites the same
-- storage path with upsert:true rather than always writing a new path. Without this, a re-post
-- silently 403s inside the storage layer even though the proofs row update succeeds.
create policy "proof_photos_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No select/delete policy on storage.objects for authenticated: every read happens through a
-- server-issued signed URL (using the secret key, which bypasses storage RLS), never a direct
-- client read of the bucket. No client ever deletes a proof photo.
