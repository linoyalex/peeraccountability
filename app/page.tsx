import { redirect } from "next/navigation";
import { z } from "zod";

import { Hero, type HeroProofState } from "@/components/Hero";
import { ProofCard } from "@/components/ProofCard";
import {
  differenceInAppDays,
  formatAppDayWeekday,
  getAppDay,
  PILOT_TIME_ZONE,
} from "@/lib/appDay";
import {
  calculateRunStats,
  habitScheduleSchema,
  isAppDayRequired,
  type RunStats,
} from "@/lib/streak";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const appDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const habitRowSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  start_date: appDaySchema,
  schedule_type: z.string(),
  schedule_config: z.unknown(),
});

const proofRowSchema = z.object({
  id: idSchema,
  user_id: idSchema,
  app_day: appDaySchema,
  submitted_at: z.string().min(1),
  photo_path: z.string().min(1),
  note: z.string().nullable(),
  status: z.enum(["waiting", "backed", "broken"]),
  resolution: z.enum(["votes", "no_response"]).nullable(),
});

const cornerRowSchema = z.object({
  subject_id: idSchema,
  witness_id: idSchema,
});

const profileRowSchema = z.object({
  id: idSchema,
  display_name: z.string().min(1).nullable(),
});

const voteRowSchema = z.object({
  proof_id: idSchema,
});

type QueryError = { message: string } | null;

function parseQuery<T>(
  schema: z.ZodType<T>,
  data: unknown,
  error: QueryError,
  label: string,
): T {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return schema.parse(data);
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function formatSubmittedAt(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid proof timestamp");
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: PILOT_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function nudgeFor(stats: RunStats, todayProofIsWaiting: boolean) {
  if (todayProofIsWaiting) {
    return "Today is in their hands.";
  }

  if (stats.currentRun === 0 && stats.lastBreak?.runLength) {
    return `${formatAppDayWeekday(stats.lastBreak.appDay)} broke a run of ${stats.lastBreak.runLength}. Start the next one now.`;
  }

  if (stats.currentRun > stats.bestRunBeforeCurrent) {
    return "New best run.";
  }

  const distanceFromBest = stats.bestRunBeforeCurrent - stats.currentRun;
  const distanceWords = ["", "One", "Two", "Three"];
  if (distanceFromBest >= 1 && distanceFromBest <= 3) {
    return `${distanceWords[distanceFromBest]} off your best run.`;
  }

  return "Keep it going.";
}

export default async function HomePage() {
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();

  if (claimsResult.error) {
    throw new Error(`Unable to verify session: ${claimsResult.error.message}`);
  }

  const userIdResult = idSchema.safeParse(claimsResult.data?.claims.sub);
  if (!userIdResult.success) {
    redirect("/login");
  }
  const userId = userIdResult.data;

  const staleResult = await supabase.rpc("resolve_stale");
  if (staleResult.error) {
    throw new Error(`Unable to resolve stale proofs: ${staleResult.error.message}`);
  }

  const habitResult = await supabase
    .from("habits")
    .select("id,name,start_date,schedule_type,schedule_config")
    .eq("user_id", userId)
    .maybeSingle();
  const habit = parseQuery(
    habitRowSchema.nullable(),
    habitResult.data,
    habitResult.error,
    "Unable to load commitment",
  );

  if (!habit) {
    throw new Error("No seeded commitment found for the signed-in user");
  }

  const schedule = habitScheduleSchema.parse({
    schedule_type: habit.schedule_type,
    schedule_config: habit.schedule_config,
  });
  const today = getAppDay(new Date());

  const [proofsResult, cornersResult, subjectsResult] = await Promise.all([
    supabase
      .from("proofs")
      .select("id,user_id,app_day,submitted_at,photo_path,note,status,resolution")
      .eq("habit_id", habit.id)
      .gte("app_day", habit.start_date)
      .lte("app_day", today)
      .order("submitted_at", { ascending: true }),
    supabase
      .from("corner_members")
      .select("subject_id,witness_id")
      .eq("subject_id", userId),
    supabase
      .from("corner_members")
      .select("subject_id,witness_id")
      .eq("witness_id", userId),
  ]);

  const proofs = parseQuery(
    z.array(proofRowSchema),
    proofsResult.data,
    proofsResult.error,
    "Unable to load proof history",
  );
  const corners = parseQuery(
    z.array(cornerRowSchema),
    cornersResult.data,
    cornersResult.error,
    "Unable to load corner",
  );
  const witnessedSubjects = parseQuery(
    z.array(cornerRowSchema),
    subjectsResult.data,
    subjectsResult.error,
    "Unable to load witnessed commitments",
  );

  if (corners.length !== 2) {
    throw new Error("The signed-in commitment must have exactly two corner members");
  }

  const witnessedSubjectIds = unique(
    witnessedSubjects.map(({ subject_id }) => subject_id),
  );
  const pendingResult = witnessedSubjectIds.length
    ? await supabase
        .from("proofs")
        .select("id,user_id,app_day,submitted_at,photo_path,note,status,resolution")
        .in("user_id", witnessedSubjectIds)
        .eq("status", "waiting")
        .order("submitted_at", { ascending: true })
    : { data: [], error: null };
  const pendingProofs = parseQuery(
    z.array(proofRowSchema),
    pendingResult.data,
    pendingResult.error,
    "Unable to load pending reviews",
  );

  const pendingIds = pendingProofs.map(({ id }) => id);
  const priorVotesResult = pendingIds.length
    ? await supabase
        .from("votes")
        .select("proof_id")
        .eq("voter_id", userId)
        .in("proof_id", pendingIds)
    : { data: [], error: null };
  const priorVotes = parseQuery(
    z.array(voteRowSchema),
    priorVotesResult.data,
    priorVotesResult.error,
    "Unable to load existing votes",
  );
  const alreadyVoted = new Set(priorVotes.map(({ proof_id }) => proof_id));
  const reviewProofs = pendingProofs.filter(({ id }) => !alreadyVoted.has(id));

  const profileIds = unique([
    ...corners.map(({ witness_id }) => witness_id),
    ...reviewProofs.map(({ user_id }) => user_id),
  ]);
  const profilesResult = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", profileIds)
    : { data: [], error: null };
  const profiles = parseQuery(
    z.array(profileRowSchema),
    profilesResult.data,
    profilesResult.error,
    "Unable to load squad profiles",
  );
  const namesById = new Map(
    profiles.map(({ id, display_name }) => [id, display_name] as const),
  );
  const requireName = (id: string) => {
    const name = namesById.get(id);
    if (!name) {
      throw new Error(`Missing display name for profile ${id}`);
    }
    return name;
  };

  const cornerNames = corners.map(({ witness_id }) => requireName(witness_id));
  const typedCornerNames: [string, string] = [cornerNames[0], cornerNames[1]];
  const runStats = calculateRunStats({
    schedule,
    startDate: habit.start_date,
    today,
    proofs: proofs.map(({ app_day, status }) => ({ appDay: app_day, status })),
  });

  const todayProofs = proofs.filter(({ app_day }) => app_day === today);
  const activeTodayProof =
    todayProofs.find(({ status }) => status === "backed") ??
    todayProofs.find(({ status }) => status === "waiting") ??
    null;
  const hasBrokenToday = todayProofs.some(({ status }) => status === "broken");
  const proofState: HeroProofState = activeTodayProof
    ? activeTodayProof.status
    : hasBrokenToday
      ? "broken"
      : "idle";
  const statusText =
    activeTodayProof?.status === "backed"
      ? activeTodayProof.resolution === "no_response"
        ? "Cleared — nobody got to it in time."
        : `${typedCornerNames[0]} and ${typedCornerNames[1]} backed it.`
      : null;
  const statusTone =
    activeTodayProof?.status === "backed"
      ? activeTodayProof.resolution === "no_response"
        ? "cleared"
        : "backed"
      : null;
  const todayIsRequired = isAppDayRequired(schedule, today);
  const actionLabel =
    proofState === "broken"
      ? "Start again"
      : proofState === "idle" && todayIsRequired
        ? "Prove it"
        : null;
  const weekNumber = Math.min(
    4,
    Math.max(1, Math.floor(differenceInAppDays(habit.start_date, today) / 7) + 1),
  );

  const admin = reviewProofs.length ? createAdminClient() : null;
  const reviewCards = await Promise.all(
    reviewProofs.map(async (proof) => {
      if (!admin) {
        throw new Error("Signed URL client was not initialized");
      }
      const signedUrlResult = await admin.storage
        .from("proofs")
        .createSignedUrl(proof.photo_path, 60 * 60);

      if (signedUrlResult.error) {
        throw new Error(`Unable to sign proof photo: ${signedUrlResult.error.message}`);
      }

      return {
        ...proof,
        subjectName: requireName(proof.user_id),
        signedUrl: signedUrlResult.data.signedUrl,
      };
    }),
  );

  return (
    <main className="min-h-full bg-bg pb-12">
      <div className="mx-auto min-h-full w-full max-w-lg bg-bg">
        <Hero
          eyebrow={`${formatAppDayWeekday(today)} · Week ${weekNumber} of 4`}
          runNumber={runStats.currentRun}
          unit={runStats.unit}
          nudge={nudgeFor(
            runStats,
            activeTodayProof?.status === "waiting",
          )}
          habitName={habit.name}
          cornerNames={typedCornerNames}
          proofState={proofState}
          statusText={statusText}
          statusTone={statusTone}
          actionLabel={actionLabel}
        />

        <section className="px-6 pb-8 pt-10">
          <h2 className="font-headline text-sm font-bold uppercase tracking-[0.18em] text-ink">
            Your call
          </h2>

          {reviewCards.length ? (
            <ul className="mt-5 space-y-4">
              {reviewCards.map((proof) => (
                <li key={proof.id}>
                  <ProofCard
                    proofId={proof.id}
                    signedUrl={proof.signedUrl}
                    subjectName={proof.subjectName}
                    submittedAt={formatSubmittedAt(proof.submitted_at)}
                    note={proof.note}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-2xl border border-line bg-white px-5 py-8 text-center text-sm text-muted">
              Nobody needs you right now.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
