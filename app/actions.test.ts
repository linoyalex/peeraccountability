import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { castVote } from "./actions";

const proofId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function actionClient(rpcError: { message: string } | null) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError });
  return {
    client: {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: userId } },
          error: null,
        }),
      },
      rpc,
    },
    rpc,
  };
}

describe("castVote server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed input before opening a Supabase client", async () => {
    await expect(castVote("not-a-proof-id", "back")).resolves.toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("surfaces the RPC authorization denial when called directly by a non-corner user", async () => {
    const { client, rpc } = actionClient({
      message: "not authorized to vote on this proof",
    });
    mocks.createClient.mockResolvedValue(client);

    await expect(castVote(proofId, "back")).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
    expect(rpc).toHaveBeenCalledWith("cast_vote", {
      p_proof_id: proofId,
      p_vote: "back",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates Home and History after a successful vote", async () => {
    const { client } = actionClient(null);
    mocks.createClient.mockResolvedValue(client);

    await expect(castVote(proofId, "call")).resolves.toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(1, "/");
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(2, "/run");
  });
});
