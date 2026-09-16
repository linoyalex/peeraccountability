import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "@playwright/test";
import ts from "typescript";

import {
  saveProofForUser,
  type ActiveProof,
  type ProofMutationStore,
} from "../lib/proofMutations";
import { calculateRunStats } from "../lib/streak";

const subject = "00000000-0000-4000-8000-000000000001";
const witnessOne = "00000000-0000-4000-8000-000000000002";
const witnessTwo = "00000000-0000-4000-8000-000000000003";
const outsider = "00000000-0000-4000-8000-000000000004";
const proofId = "10000000-0000-4000-8000-000000000001";

function castVoteSql() {
  const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
  const match = schema.match(
    /create or replace function public\.cast_vote\(p_proof_id uuid, p_vote text\)[\s\S]*?\n\$\$;/,
  );
  if (!match) throw new Error("Unable to find cast_vote() in supabase/schema.sql");
  return match[0];
}

async function createVoteDatabase() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    create table public.profiles (id uuid primary key);
    create table public.corner_members (
      subject_id uuid not null references public.profiles (id),
      witness_id uuid not null references public.profiles (id),
      primary key (subject_id, witness_id),
      check (subject_id <> witness_id)
    );
    create table public.proofs (
      id uuid primary key,
      user_id uuid not null references public.profiles (id),
      status text not null check (status in ('waiting', 'backed', 'broken')),
      resolution text check (resolution in ('votes', 'no_response')),
      resolved_at timestamptz
    );
    create table public.votes (
      proof_id uuid not null references public.proofs (id),
      voter_id uuid not null references public.profiles (id),
      vote text not null check (vote in ('back', 'call')),
      voted_at timestamptz not null default now(),
      unique (proof_id, voter_id)
    );

    ${castVoteSql()}

    insert into public.profiles (id) values
      ('${subject}'), ('${witnessOne}'), ('${witnessTwo}'), ('${outsider}');
    insert into public.corner_members (subject_id, witness_id) values
      ('${subject}', '${witnessOne}'), ('${subject}', '${witnessTwo}');
    insert into public.proofs (id, user_id, status)
      values ('${proofId}', '${subject}', 'waiting');
  `);
  return db;
}

async function vote(db: PGlite, voterId: string, value: "back" | "call") {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [voterId]);
  await db.query("select public.cast_vote($1::uuid, $2::text)", [proofId, value]);
}

async function proofState(db: PGlite) {
  const result = await db.query<{ status: "waiting" | "backed" | "broken"; resolution: string | null }>(
    "select status, resolution from public.proofs where id = $1::uuid",
    [proofId],
  );
  return result.rows[0];
}

test("one back waits; two backs resolve and increment the run", async () => {
  const db = await createVoteDatabase();
  try {
    await vote(db, witnessOne, "back");
    expect(await proofState(db)).toEqual({ status: "waiting", resolution: null });

    await vote(db, witnessTwo, "back");
    expect(await proofState(db)).toEqual({ status: "backed", resolution: "votes" });
    expect(
      calculateRunStats({
        schedule: { schedule_type: "daily", schedule_config: {} },
        startDate: "2026-09-16",
        today: "2026-09-16",
        proofs: [{ appDay: "2026-09-16", status: "backed" }],
      }).currentRun,
    ).toBe(1);
  } finally {
    await db.close();
  }
});

test("two calls resolve the proof as broken", async () => {
  const db = await createVoteDatabase();
  try {
    await vote(db, witnessOne, "call");
    expect(await proofState(db)).toEqual({ status: "waiting", resolution: null });
    await vote(db, witnessTwo, "call");
    expect(await proofState(db)).toEqual({ status: "broken", resolution: "votes" });
  } finally {
    await db.close();
  }
});

test("a split vote stays waiting", async () => {
  const db = await createVoteDatabase();
  try {
    await vote(db, witnessOne, "back");
    await vote(db, witnessTwo, "call");
    expect(await proofState(db)).toEqual({ status: "waiting", resolution: null });
  } finally {
    await db.close();
  }
});

test("a non-corner member cannot vote", async () => {
  const db = await createVoteDatabase();
  try {
    await expect(vote(db, outsider, "back")).rejects.toThrow(
      "not authorized to vote on this proof",
    );
    expect(await proofState(db)).toEqual({ status: "waiting", resolution: null });
    const count = await db.query<{ count: string }>("select count(*)::text as count from public.votes");
    expect(count.rows[0]?.count).toBe("0");
  } finally {
    await db.close();
  }
});

test("posting twice in one app-day replaces the existing proof row", async () => {
  const proofs: ActiveProof[] = [];
  const store: ProofMutationStore = {
    async findActiveProof(userId, appDay) {
      return (
        proofs.find(
          (proof) => proof.userId === userId && proof.appDay === appDay,
        ) ?? null
      );
    },
    async uploadPhoto() {},
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
      const proof = proofs.find(({ id }) => id === input.id);
      if (!proof || proof.status !== "waiting") return false;
      proof.photoPath = input.photoPath;
      return true;
    },
    async removePhoto() {},
  };
  const generated = [
    "20000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000002",
  ];
  const submit = () =>
    saveProofForUser(store, {
      userId: subject,
      habitId: "30000000-0000-4000-8000-000000000001",
      appDay: "2026-09-16",
      photo: new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "proof.jpg", {
        type: "image/jpeg",
      }),
      note: null,
      generateId: () => {
        const id = generated.shift();
        if (!id) throw new Error("No generated id left");
        return id;
      },
    });

  const first = await submit();
  const second = await submit();

  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  expect(proofs).toHaveLength(1);
  expect(proofs[0]?.id).toBe("20000000-0000-4000-8000-000000000001");
  expect(proofs[0]?.photoPath).toContain("20000000-0000-4000-8000-000000000002.jpg");
});

test("proof photos are JPEGs no larger than 1280px and 300KB", async ({ page }) => {
  const imageSource = readFileSync(resolve(process.cwd(), "lib/image.ts"), "utf8").replace(
    /^export /gm,
    "",
  );
  const browserScript = ts.transpileModule(imageSource, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({
    content: `${browserScript}\nwindow.downscaleProofImage = downscaleProofImage;`,
  });

  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1600;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");

    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 17;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (seed * 16_807) % 2_147_483_647;
      pixels.data[index] = seed % 256;
      pixels.data[index + 1] = (seed >> 4) % 256;
      pixels.data[index + 2] = (seed >> 8) % 256;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);

    const original = await new Promise<Blob>((resolveBlob, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolveBlob(blob);
        else reject(new Error("Unable to create source image"));
      }, "image/png");
    });
    const sourceFile = new File([original], "camera.png", { type: "image/png" });
    const browserWindow = window as typeof window & {
      downscaleProofImage: (file: File) => Promise<File>;
    };
    const compressed = await browserWindow.downscaleProofImage(sourceFile);
    const decoded = await createImageBitmap(compressed);
    const dimensions = { width: decoded.width, height: decoded.height };
    decoded.close();

    return {
      ...dimensions,
      size: compressed.size,
      type: compressed.type,
      name: compressed.name,
    };
  });

  expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1280);
  expect(result.size).toBeLessThanOrEqual(300 * 1024);
  expect(result.type).toBe("image/jpeg");
  expect(result.name).toBe("camera.jpg");
});
