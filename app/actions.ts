"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppDay } from "@/lib/appDay";
import {
  saveProofForUser,
  type ActiveProof,
  type ProofMutationStore,
} from "@/lib/proofMutations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const habitSchema = z.object({ id: idSchema });
const activeProofSchema = z.object({
  id: idSchema,
  user_id: idSchema,
  app_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  photo_path: z.string().min(1),
  status: z.enum(["waiting", "backed"]),
});
const voteSchema = z.enum(["back", "call"]);
const photoSchema = z
  .custom<File>((value) => typeof File !== "undefined" && value instanceof File)
  .refine((file) => file.size > 0, "A proof photo is required")
  .refine((file) => file.type === "image/jpeg", "Proof photo must be a JPEG")
  .refine((file) => file.size <= 300 * 1024, "Proof photo must be under 300KB");

export type ProofActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_input" | "not_ready" | "conflict" | "failed";
    };

async function verifiedUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error) return null;
  const parsed = idSchema.safeParse(claimsResult.data?.claims.sub);
  return parsed.success ? parsed.data : null;
}

function noteFrom(formData: FormData) {
  const parsed = z.string().safeParse(formData.get("note"));
  if (!parsed.success) return null;
  const trimmed = parsed.data.trim();
  return trimmed || null;
}

export async function postProof(formData: FormData): Promise<ProofActionResult> {
  const photoResult = photoSchema.safeParse(formData.get("photo"));
  if (!photoResult.success) {
    return { ok: false, reason: "invalid_input" };
  }

  const supabase = await createClient();
  const userId = await verifiedUserId(supabase);
  if (!userId) {
    return { ok: false, reason: "unauthorized" };
  }

  const habitResult = await supabase
    .from("habits")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (habitResult.error) {
    return { ok: false, reason: "failed" };
  }
  const habit = habitSchema.safeParse(habitResult.data);
  if (!habit.success) {
    return { ok: false, reason: "not_ready" };
  }

  const store: ProofMutationStore = {
    async findActiveProof(ownerId, appDay): Promise<ActiveProof | null> {
      const result = await supabase
        .from("proofs")
        .select("id,user_id,app_day,photo_path,status")
        .eq("user_id", ownerId)
        .eq("app_day", appDay)
        .in("status", ["waiting", "backed"])
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      if (!result.data) return null;
      const parsed = activeProofSchema.parse(result.data);
      return {
        id: parsed.id,
        userId: parsed.user_id,
        appDay: parsed.app_day,
        photoPath: parsed.photo_path,
        status: parsed.status,
      };
    },
    async uploadPhoto(path, photo) {
      const result = await supabase.storage.from("proofs").upload(path, photo, {
        cacheControl: "3600",
        contentType: "image/jpeg",
        upsert: false,
      });
      if (result.error) throw new Error(result.error.message);
    },
    async insertProof(input) {
      const result = await supabase.from("proofs").insert({
        id: input.id,
        user_id: input.userId,
        habit_id: input.habitId,
        app_day: input.appDay,
        photo_path: input.photoPath,
        note: input.note,
      });
      if (result.error) throw new Error(result.error.message);
    },
    async updateWaitingProof(input) {
      const result = await supabase
        .from("proofs")
        .update({ photo_path: input.photoPath, note: input.note })
        .eq("id", input.id)
        .eq("user_id", input.userId)
        .eq("status", "waiting")
        .eq("photo_path", input.previousPhotoPath)
        .select("id")
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      return Boolean(result.data);
    },
    async removePhoto(path) {
      const result = await createAdminClient().storage.from("proofs").remove([path]);
      if (result.error) throw new Error(result.error.message);
    },
  };

  const result = await saveProofForUser(store, {
    userId,
    habitId: habit.data.id,
    appDay: getAppDay(new Date()),
    photo: photoResult.data,
    note: noteFrom(formData),
    generateId: () => crypto.randomUUID(),
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === "already_resolved" ? "conflict" : "failed",
    };
  }

  revalidatePath("/");
  revalidatePath("/run");
  return { ok: true };
}

export async function castVote(proofId: string, vote: string): Promise<ProofActionResult> {
  const input = z
    .object({ proofId: idSchema, vote: voteSchema })
    .safeParse({ proofId, vote });
  if (!input.success) {
    return { ok: false, reason: "invalid_input" };
  }

  const supabase = await createClient();
  const userId = await verifiedUserId(supabase);
  if (!userId) {
    return { ok: false, reason: "unauthorized" };
  }

  const result = await supabase.rpc("cast_vote", {
    p_proof_id: input.data.proofId,
    p_vote: input.data.vote,
  });
  if (result.error) {
    return { ok: false, reason: "failed" };
  }

  revalidatePath("/");
  revalidatePath("/run");
  return { ok: true };
}
