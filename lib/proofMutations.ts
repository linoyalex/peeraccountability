export interface ActiveProof {
  id: string;
  userId: string;
  appDay: string;
  photoPath: string;
  status: "waiting" | "backed";
}

export interface ProofMutationStore {
  findActiveProof(userId: string, appDay: string): Promise<ActiveProof | null>;
  uploadPhoto(path: string, photo: File): Promise<void>;
  insertProof(input: {
    id: string;
    userId: string;
    habitId: string;
    appDay: string;
    photoPath: string;
    note: string | null;
  }): Promise<void>;
  updateWaitingProof(input: {
    id: string;
    userId: string;
    previousPhotoPath: string;
    photoPath: string;
    note: string | null;
  }): Promise<boolean>;
  removePhoto(path: string): Promise<void>;
}

export type SaveProofResult =
  | { ok: true; proofId: string }
  | {
      ok: false;
      reason: "already_resolved" | "upload_failed" | "write_conflict" | "write_failed";
    };

interface SaveProofInput {
  userId: string;
  habitId: string;
  appDay: string;
  photo: File;
  note: string | null;
  generateId: () => string;
}

async function bestEffortRemove(store: ProofMutationStore, path: string) {
  try {
    await store.removePhoto(path);
  } catch {
    // A failed cleanup leaves only a private, unreferenced object. The proof mutation result is
    // still authoritative, and the bucket is cleared as part of the test/pilot teardown.
  }
}

export async function saveProofForUser(
  store: ProofMutationStore,
  input: SaveProofInput,
): Promise<SaveProofResult> {
  let active: ActiveProof | null;
  try {
    active = await store.findActiveProof(input.userId, input.appDay);
  } catch {
    return { ok: false, reason: "write_failed" };
  }

  if (active?.status === "backed") {
    return { ok: false, reason: "already_resolved" };
  }

  const submissionId = input.generateId();
  const photoPath = `${input.userId}/${submissionId}.jpg`;

  try {
    await store.uploadPhoto(photoPath, input.photo);
  } catch {
    return { ok: false, reason: "upload_failed" };
  }

  try {
    if (active) {
      const previousPhotoPath = active.photoPath;
      const updated = await store.updateWaitingProof({
        id: active.id,
        userId: input.userId,
        previousPhotoPath,
        photoPath,
        note: input.note,
      });

      if (!updated) {
        await bestEffortRemove(store, photoPath);
        return { ok: false, reason: "write_conflict" };
      }

      await bestEffortRemove(store, previousPhotoPath);
      return { ok: true, proofId: active.id };
    }

    await store.insertProof({
      id: submissionId,
      userId: input.userId,
      habitId: input.habitId,
      appDay: input.appDay,
      photoPath,
      note: input.note,
    });
    return { ok: true, proofId: submissionId };
  } catch {
    await bestEffortRemove(store, photoPath);
    return { ok: false, reason: "write_failed" };
  }
}
