import fs from "fs";
import path from "path";

import { buildNotificationDedupeKey } from "../../functions/src/notifications/dedupeKey";
import {
  MODERATION_ACTOR_DISPLAY_NAME,
  MODERATION_ACTOR_ID,
  moderationOutcomeType,
} from "../../functions/src/moderation/moderationOutcome";
import {
  notificationAccessibilityLabel,
  presentNotification,
} from "../../src/features/notifications/services/notificationPresentation";
import { resolveNotificationDestination } from "../../src/features/notifications/services/notificationNavigation";
import { NotificationRecord, NotificationType } from "../../src/types/notification";

// Phase 99 — what the student is told when a human finishes reviewing their
// content, and the identity that makes them told exactly once.
//
// Two properties are worth a test rather than a read-through:
//
// IDENTITY. "Exactly one outcome per submission" is not enforced by the
// calling code — it is a consequence of the notification's document id being
// derived from the immutable submission id. If that derivation ever stops
// including the submission, two rejected answers on the SAME question would
// collapse into one notification and the student would silently lose one of
// them. That failure is invisible in every other test.
//
// WHAT IS NOT SAID. The reviewing teacher and the machine reason that sent
// the submission to review are both deliberately absent from the author's
// copy. "provider_unavailable" is an operational fact about a vendor, not
// something a student did; naming it, or naming the teacher, turns a neutral
// publication outcome into an accusation or an argument.

function notification(overrides: Partial<NotificationRecord>): NotificationRecord {
  return {
    id: "n1",
    recipientId: "student-1",
    actorId: MODERATION_ACTOR_ID,
    actorDisplayName: MODERATION_ACTOR_DISPLAY_NAME,
    actorUsername: null,
    actorPhotoURL: null,
    type: "answer_review_approved",
    entityType: "moderation",
    entityId: "student-1_op-1",
    parentEntityId: "question-1",
    classId: null,
    messagePreview: null,
    createdAt: 1,
    readAt: null,
    isRead: false,
    ...overrides,
  };
}

describe("outcome type selection", () => {
  it("U1/U2 an answer submission maps to the answer outcome types", () => {
    expect(moderationOutcomeType("answer_image", "approved")).toBe("answer_review_approved");
    expect(moderationOutcomeType("answer_image", "rejected")).toBe("answer_review_rejected");
  });

  it("U3/U4 a comment submission maps to the comment outcome types", () => {
    expect(moderationOutcomeType("question_comment", "approved")).toBe("comment_review_approved");
    expect(moderationOutcomeType("question_comment", "rejected")).toBe("comment_review_rejected");
  });

  it("approval and rejection are never the same type", () => {
    expect(moderationOutcomeType("answer_image", "approved")).not.toBe(
      moderationOutcomeType("answer_image", "rejected"),
    );
    expect(moderationOutcomeType("question_comment", "approved")).not.toBe(
      moderationOutcomeType("question_comment", "rejected"),
    );
  });
});

describe("author copy", () => {
  const cases: [NotificationType, string, string][] = [
    ["answer_review_approved", "Yanıtın yayınlandı", "yayınlandı"],
    ["answer_review_rejected", "Yanıtın yayınlanmadı", "yayınlanmadı"],
    ["comment_review_approved", "Yorumun yayınlandı", "yayınlandı"],
    ["comment_review_rejected", "Yorumun yayınlanmadı", "yayınlanmadı"],
  ];

  it.each(cases)("U1–U4 %s states the outcome plainly", (type, title) => {
    expect(presentNotification(notification({ type })).title).toBe(title);
  });

  it("U5 no machine reason reaches the student", () => {
    // These are the four reasons a submission can land in manual_review. None
    // of them is the student's doing, and none belongs in their inbox.
    const leaks = ["provider_unavailable", "no_ocr_provider", "no_image_provider", "uncertain",
      "manual_review", "moderation", "Vision", "SafeSearch"];
    for (const [type] of cases) {
      const p = presentNotification(notification({ type }));
      const text = `${p.title} ${p.secondaryText ?? ""}`;
      for (const leak of leaks) expect(text).not.toContain(leak);
    }
  });

  it("U6 the reviewing teacher is never named", () => {
    // Every other notification type renders actorDisplayName. These four must
    // not, whatever the document happens to carry.
    for (const [type] of cases) {
      const p = presentNotification(
        notification({ type, actorId: "teacher-a", actorDisplayName: "Öğretmen Ayşe" }),
      );
      const text = `${p.title} ${p.secondaryText ?? ""}`;
      expect(text).not.toContain("Öğretmen Ayşe");
      expect(text).not.toContain("teacher-a");
    }
  });

  it("a rejection offers a next step and never implies the answer was wrong", () => {
    const p = presentNotification(notification({ type: "answer_review_rejected" }));
    expect(p.secondaryText).toBe("Yeni bir yanıt gönderebilirsin.");
    for (const word of ["yanlış", "hatalı", "kural", "uygunsuz", "ihlal"]) {
      expect(`${p.title} ${p.secondaryText}`).not.toContain(word);
    }
  });

  it("the spoken label carries the outcome and the next step, not just the title", () => {
    const n = notification({ type: "comment_review_rejected" });
    const label = notificationAccessibilityLabel(n, presentNotification(n));
    expect(label).toContain("Yorumun yayınlanmadı");
    expect(label).toContain("Yeni bir yorum gönderebilirsin.");
    expect(label).toContain("Okunmadı.");
  });
});

describe("navigation", () => {
  it("every outcome opens the parent question for the student", () => {
    for (const type of ["answer_review_approved", "answer_review_rejected",
      "comment_review_approved", "comment_review_rejected"] as NotificationType[]) {
      expect(resolveNotificationDestination(notification({ type }), "student")).toEqual({
        kind: "route",
        path: "/(student)/question/question-1",
      });
    }
  });

  it("a rejection never routes to content that does not exist", () => {
    // entityId is the moderation submission; it must never become a route.
    const n = notification({ type: "answer_review_rejected", entityId: "student-1_op-9" });
    const dest = resolveNotificationDestination(n, "student");
    expect(JSON.stringify(dest)).not.toContain("student-1_op-9");
    expect(JSON.stringify(dest)).not.toContain("moderation");
    expect(JSON.stringify(dest)).not.toContain("review");
  });

  it("a missing parent question degrades to unavailable instead of a broken route", () => {
    const n = notification({ type: "answer_review_approved", parentEntityId: null });
    expect(resolveNotificationDestination(n, "student").kind).toBe("unavailable");
  });
});

describe("notification identity", () => {
  const keyFor = (authorId: string, type: NotificationType, submissionId: string) =>
    buildNotificationDedupeKey({
      recipientId: authorId,
      type: type as never,
      actorId: MODERATION_ACTOR_ID,
      entityId: submissionId,
    });

  it("U7/U9 the same decision on the same submission is always the same document", () => {
    const first = keyFor("student-1", "answer_review_approved", "student-1_op-1");
    const retry = keyFor("student-1", "answer_review_approved", "student-1_op-1");
    expect(retry).toBe(first);
  });

  it("U8 two submissions on the SAME question get two distinct outcomes", () => {
    // The case a question-keyed identity would silently lose: a student whose
    // first answer is rejected sends another, and that one is rejected too.
    const a = keyFor("student-1", "answer_review_rejected", "student-1_op-1");
    const b = keyFor("student-1", "answer_review_rejected", "student-1_op-2");
    expect(a).not.toBe(b);
  });

  it("the identity is bound to the submission, and carries no reviewer", () => {
    const key = keyFor("student-1", "answer_review_approved", "student-1_op-1");
    expect(key).toContain("student-1_op-1");
    expect(key).toContain(MODERATION_ACTOR_ID);
    expect(key).not.toContain("teacher");
  });

  it("different authors and different content kinds never collide", () => {
    const keys = new Set([
      keyFor("student-1", "answer_review_approved", "student-1_op-1"),
      keyFor("student-2", "answer_review_approved", "student-2_op-1"),
      keyFor("student-1", "comment_review_approved", "student-1_op-1"),
      keyFor("student-1", "answer_review_rejected", "student-1_op-1"),
    ]);
    expect(keys.size).toBe(4);
  });
});

describe("the actor is the platform, not a person", () => {
  it("U6 the system actor cannot collide with a Firebase uid", () => {
    // A 28-character uid can never equal this, so the self-actor guard in
    // prepareNotification can never suppress an outcome addressed to the
    // person it is about — and no real account is ever credited with the
    // decision.
    expect(MODERATION_ACTOR_ID).toBe("system");
    expect(MODERATION_ACTOR_ID.length).toBeLessThan(28);
  });

  it("U10 the outcome helper references no learning state and no counter", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "functions", "src", "moderation", "moderationOutcome.ts"),
      "utf8",
    );
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    for (const forbidden of ["studyEvents", "studyItems", "semanticDefinitions", "answerCount",
      "commentCount", "increment", "reviewedBy"]) {
      expect(code).not.toContain(forbidden);
    }
  });
});
