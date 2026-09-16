import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  differenceInAppDays,
  formatAppDayWeekday,
  getAppDay,
} from "@/lib/appDay";
import { calculateRunStats, habitScheduleSchema, type HabitSchedule } from "@/lib/streak";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const appDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const habitSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  start_date: appDaySchema,
  schedule_type: z.string(),
  schedule_config: z.unknown(),
});
const proofSchema = z.object({
  id: idSchema,
  app_day: appDaySchema,
  submitted_at: z.string().min(1),
  photo_path: z.string().min(1),
  note: z.string().nullable(),
  status: z.enum(["backed", "broken"]),
  resolution: z.enum(["votes", "no_response"]).nullable(),
});
const voteSchema = z.object({ proof_id: idSchema, voter_id: idSchema });
const cornerSchema = z.object({ witness_id: idSchema });
const profileSchema = z.object({ id: idSchema, display_name: z.string().min(1).nullable() });

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function scheduleDescription(schedule: HabitSchedule) {
  if (schedule.schedule_type === "daily") return "Daily";
  if (schedule.schedule_type === "days_per_week_floating") {
    return `${schedule.schedule_config.days_per_week} days/week`;
  }
  return schedule.schedule_config.weekdays.map((day) => weekdayNames[day]).join(", ");
}

function formatHistoryDate(appDay: string) {
  const [year, month, day] = appDay.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${formatAppDayWeekday(appDay, "short")}, ${new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(date)}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function RunPage() {
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  const userIdResult = idSchema.safeParse(claimsResult.data?.claims.sub);
  if (claimsResult.error || !userIdResult.success) {
    redirect("/login");
  }
  const userId = userIdResult.data;

  const [habitResult, cornerResult] = await Promise.all([
    supabase
      .from("habits")
      .select("id,name,start_date,schedule_type,schedule_config")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("corner_members")
      .select("witness_id")
      .eq("subject_id", userId),
  ]);
  if (habitResult.error || cornerResult.error) {
    throw new Error("Unable to load run history");
  }
  const habit = habitSchema.parse(habitResult.data);
  const schedule = habitScheduleSchema.parse({
    schedule_type: habit.schedule_type,
    schedule_config: habit.schedule_config,
  });
  const corners = z.array(cornerSchema).length(2).parse(cornerResult.data);

  const proofResult = await supabase
    .from("proofs")
    .select("id,app_day,submitted_at,photo_path,note,status,resolution")
    .eq("habit_id", habit.id)
    .gte("app_day", habit.start_date)
    .in("status", ["backed", "broken"])
    .order("submitted_at", { ascending: false });
  if (proofResult.error) {
    throw new Error("Unable to load proof history");
  }
  const proofs = z.array(proofSchema).parse(proofResult.data);
  const proofIds = proofs.map(({ id }) => id);

  const voteResult = proofIds.length
    ? await supabase.from("votes").select("proof_id,voter_id").in("proof_id", proofIds)
    : { data: [], error: null };
  if (voteResult.error) {
    throw new Error("Unable to load proof votes");
  }
  const votes = z.array(voteSchema).parse(voteResult.data);
  const profileIds = [
    ...new Set([
      ...corners.map(({ witness_id }) => witness_id),
      ...votes.map(({ voter_id }) => voter_id),
    ]),
  ];
  const profileResult = await supabase
    .from("profiles")
    .select("id,display_name")
    .in("id", profileIds);
  if (profileResult.error) {
    throw new Error("Unable to load squad profiles");
  }
  const profiles = z.array(profileSchema).parse(profileResult.data);
  const names = new Map(profiles.map((profile) => [profile.id, profile.display_name]));
  const cornerNames = corners.map(({ witness_id }) => names.get(witness_id));
  if (!cornerNames[0] || !cornerNames[1]) {
    throw new Error("The signed-in commitment must have two named corner members");
  }

  const today = getAppDay(new Date());
  const runStats = calculateRunStats({
    schedule,
    startDate: habit.start_date,
    today,
    proofs: proofs.map((proof) => ({ appDay: proof.app_day, status: proof.status })),
  });
  const weekNumber = Math.min(
    4,
    Math.max(1, Math.floor(differenceInAppDays(habit.start_date, today) / 7) + 1),
  );
  const votesByProof = new Map<string, string[]>();
  for (const vote of votes) {
    const name = names.get(vote.voter_id);
    if (name) {
      votesByProof.set(vote.proof_id, [...(votesByProof.get(vote.proof_id) ?? []), name]);
    }
  }

  const admin = proofs.length ? createAdminClient() : null;
  const history = await Promise.all(
    proofs.map(async (proof) => {
      if (!admin) throw new Error("Signed URL client was not initialized");
      const signed = await admin.storage.from("proofs").createSignedUrl(proof.photo_path, 60 * 60);
      if (signed.error) throw new Error(`Unable to sign proof photo: ${signed.error.message}`);
      return { ...proof, signedUrl: signed.data.signedUrl };
    }),
  );

  return (
    <main className="min-h-svh bg-bg pb-10 text-ink">
      <div className="mx-auto w-full max-w-lg">
        <header className="bg-ink px-6 pb-8 pt-6 text-white">
          <Link href="/" className="flex min-h-11 items-center text-sm text-white/75">
            <span aria-hidden="true">←</span>
            <span className="ml-2">Your run</span>
          </Link>
          <h1 className="mt-5 font-headline text-3xl font-bold">{habit.name}</h1>
          <p className="mt-3 font-headline text-xl font-bold text-white/85">
            {runStats.currentRun} in a row
          </p>
        </header>

        <section className="space-y-4 px-6 py-8">
          {history.map((proof) => {
            const isCleared = proof.status === "backed" && proof.resolution === "no_response";
            const isBacked = proof.status === "backed" && !isCleared;
            const voterNames = votesByProof.get(proof.id) ?? [];
            return (
              <article
                key={proof.id}
                className="flex gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm"
              >
                <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-line">
                  <Image
                    src={proof.signedUrl}
                    alt={`Proof for ${formatHistoryDate(proof.app_day)}`}
                    fill
                    sizes="96px"
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{formatHistoryDate(proof.app_day)}</p>
                  <p
                    className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                      isCleared
                        ? "border border-line bg-bg text-muted"
                        : isBacked
                          ? "bg-backed text-white"
                          : "bg-accent text-white"
                    }`}
                  >
                    {isCleared ? "Cleared" : isBacked ? "Backed" : "Call it"}
                  </p>
                  {proof.note ? <p className="mt-2 text-sm text-muted">{proof.note}</p> : null}
                  {voterNames.length ? (
                    <div className="mt-3 flex -space-x-2" aria-label="Corner votes">
                      {voterNames.map((name) => (
                        <span
                          key={name}
                          title={name}
                          className="grid size-7 place-items-center rounded-full border-2 border-white bg-ink font-headline text-[0.6rem] font-bold text-white"
                        >
                          {initials(name)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        <footer className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-sm text-muted">
            Week {weekNumber} of 4 · {scheduleDescription(schedule)} · {cornerNames[0]} &amp;{" "}
            {cornerNames[1]}
          </p>
          <button
            type="button"
            disabled
            className="mt-6 min-h-12 w-full rounded-2xl border border-accent px-4 font-bold text-accent opacity-60"
          >
            End this commitment
          </button>
        </footer>
      </div>
    </main>
  );
}
