import { buildLikeId } from "@features/social/likes/services/likeId";

describe("buildLikeId", () => {
  it("builds a deterministic id from targetId and userId", () => {
    expect(buildLikeId("q1", "user-1")).toBe("q1_user-1");
  });

  it("produces the same id for the same inputs every time (idempotent identity)", () => {
    expect(buildLikeId("q1", "user-1")).toBe(buildLikeId("q1", "user-1"));
  });

  it("produces different ids for different targets", () => {
    expect(buildLikeId("q1", "user-1")).not.toBe(buildLikeId("q2", "user-1"));
  });

  it("produces different ids for different users", () => {
    expect(buildLikeId("q1", "user-1")).not.toBe(buildLikeId("q1", "user-2"));
  });
});
