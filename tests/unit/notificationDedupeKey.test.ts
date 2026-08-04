import { buildNotificationDedupeKey } from "../../functions/src/notifications/dedupeKey";

describe("buildNotificationDedupeKey", () => {
  it("is deterministic for the same inputs", () => {
    const params = { recipientId: "r1", type: "question_liked" as const, actorId: "a1", entityId: "q1" };
    expect(buildNotificationDedupeKey(params)).toBe(buildNotificationDedupeKey(params));
  });

  it("differs when the actor differs (two different likers)", () => {
    const base = { recipientId: "r1", type: "question_liked" as const, entityId: "q1" };
    expect(buildNotificationDedupeKey({ ...base, actorId: "a1" })).not.toBe(
      buildNotificationDedupeKey({ ...base, actorId: "a2" }),
    );
  });

  it("differs when the type differs (same actor/entity, different event)", () => {
    const base = { recipientId: "r1", actorId: "a1", entityId: "q1" };
    expect(
      buildNotificationDedupeKey({ ...base, type: "question_liked" }),
    ).not.toBe(buildNotificationDedupeKey({ ...base, type: "question_commented" }));
  });

  it("differs when the entity differs (same actor liking two different questions)", () => {
    const base = { recipientId: "r1", type: "question_liked" as const, actorId: "a1" };
    expect(buildNotificationDedupeKey({ ...base, entityId: "q1" })).not.toBe(
      buildNotificationDedupeKey({ ...base, entityId: "q2" }),
    );
  });

  it("re-liking after unliking (same tuple) reproduces the exact same key — the dedupe/toggle contract", () => {
    const params = { recipientId: "r1", type: "answer_liked" as const, actorId: "a1", entityId: "ans1" };
    const first = buildNotificationDedupeKey(params);
    const second = buildNotificationDedupeKey(params);
    expect(first).toBe(second);
  });
});
