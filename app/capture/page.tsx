import { redirect } from "next/navigation";
import { z } from "zod";

import { CaptureFlow } from "@/components/CaptureFlow";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const habitSchema = z.object({ name: z.string().min(1) });
const cornerSchema = z.object({ witness_id: idSchema });
const profileSchema = z.object({ id: idSchema, display_name: z.string().min(1).nullable() });

export default async function CapturePage() {
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  const userIdResult = idSchema.safeParse(claimsResult.data?.claims.sub);
  if (claimsResult.error || !userIdResult.success) {
    redirect("/login");
  }
  const userId = userIdResult.data;

  const [habitResult, cornerResult] = await Promise.all([
    supabase.from("habits").select("name").eq("user_id", userId).maybeSingle(),
    supabase
      .from("corner_members")
      .select("witness_id")
      .eq("subject_id", userId),
  ]);
  if (habitResult.error || cornerResult.error) {
    throw new Error("Unable to load proof capture");
  }
  const habit = habitSchema.parse(habitResult.data);
  const corners = z.array(cornerSchema).length(2).parse(cornerResult.data);

  const profileResult = await supabase
    .from("profiles")
    .select("id,display_name")
    .in(
      "id",
      corners.map(({ witness_id }) => witness_id),
    );
  if (profileResult.error) {
    throw new Error("Unable to load corner names");
  }
  const profiles = z.array(profileSchema).parse(profileResult.data);
  const names = new Map(profiles.map((profile) => [profile.id, profile.display_name]));
  const cornerNames = corners.map(({ witness_id }) => names.get(witness_id));
  if (!cornerNames[0] || !cornerNames[1]) {
    throw new Error("The signed-in commitment must have two named corner members");
  }

  return (
    <CaptureFlow
      habitName={habit.name}
      cornerNames={[cornerNames[0], cornerNames[1]]}
    />
  );
}
