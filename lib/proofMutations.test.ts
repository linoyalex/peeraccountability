import { describe, expect, it } from "vitest";

import {
  saveProofForUser,
  type ActiveProof,
  type ProofMutationStore,
} from "./proofMutations";

function jpegFile(name = "proof.jpg") {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], name, {
    type: "image/jpeg",
  });
}

function createStore() {
  const proofs: ActiveProof[] = [];
  const uploaded: string[] = [];
  const removed: string[] = [];

  const store: ProofMutationStore = {
    async findActiveProof(userId, appDay) {
      return (
        proofs.find(
          (proof) =>
            proof.userId === userId &&
            proof.appDay === appDay &&
            (proof.status === "waiting" || proof.status === "backed"),
        ) ?? null
      );
    },
    async uploadPhoto(path) {
      uploaded.push(path);
    },
    async insertProof(input) {
      proofs.push({
        id: input.id,
        userId: input.userId,
        appDay: input.appDay,
        photoPath: input.photoPath,
        status: "waiting",
      });
    },
    async updateWaitingProof(input) {
      const proof = proofs.find(
        (candidate) => candidate.id === input.id && candidate.status === "waiting",
      );
      if (!proof) return false;
      proof.photoPath = input.photoPath;
      return true;
    },
    async removePhoto(path) {
      removed.push(path);
    },
  };

  return { store, proofs, uploaded, removed };
}

describe("saveProofForUser", () => {
  it("updates the waiting proof in place on a second post that app-day", async () => {
    const { store, proofs, uploaded, removed } = createStore();
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const nextId = () => {
      const id = ids.shift();
      if (!id) throw new Error("No test id left");
      return id;
    };

    const first = await saveProofForUser(store, {
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      habitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      appDay: "2026-09-16",
      photo: jpegFile("first.jpg"),
      note: "first",
      generateId: nextId,
    });
    const second = await saveProofForUser(store, {
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      habitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      appDay: "2026-09-16",
      photo: jpegFile("second.jpg"),
      note: "replacement",
      generateId: nextId,
    });

    expect(first).toEqual({ ok: true, proofId: "11111111-1111-4111-8111-111111111111" });
    expect(second).toEqual({ ok: true, proofId: "11111111-1111-4111-8111-111111111111" });
    expect(proofs).toHaveLength(1);
    expect(proofs[0]?.photoPath).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/22222222-2222-4222-8222-222222222222.jpg",
    );
    expect(uploaded).toHaveLength(2);
    expect(removed).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111.jpg",
    ]);
  });

  it("does not replace a proof that has already resolved", async () => {
    const { store, proofs, uploaded } = createStore();
    proofs.push({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      appDay: "2026-09-16",
      photoPath: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.jpg",
      status: "backed",
    });

    const result = await saveProofForUser(store, {
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      habitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      appDay: "2026-09-16",
      photo: jpegFile(),
      note: null,
      generateId: () => "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual({ ok: false, reason: "already_resolved" });
    expect(uploaded).toHaveLength(0);
  });

  it("removes a newly uploaded photo when the database write loses a race", async () => {
    const { store, proofs, removed } = createStore();
    proofs.push({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      appDay: "2026-09-16",
      photoPath: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.jpg",
      status: "waiting",
    });
    store.updateWaitingProof = async () => false;

    const result = await saveProofForUser(store, {
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      habitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      appDay: "2026-09-16",
      photo: jpegFile(),
      note: null,
      generateId: () => "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual({ ok: false, reason: "write_conflict" });
    expect(removed).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/22222222-2222-4222-8222-222222222222.jpg",
    ]);
  });
});
