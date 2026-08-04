import { resolveNotificationDestination } from "@features/notifications/services/notificationNavigation";
import { NotificationRecord } from "@/types/notification";

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: "n1",
    recipientId: "r1",
    actorId: "a1",
    actorDisplayName: "Ayşe",
    actorUsername: null,
    actorPhotoURL: null,
    type: "question_liked",
    entityType: "question",
    entityId: "q1",
    parentEntityId: null,
    classId: null,
    messagePreview: null,
    createdAt: 1,
    readAt: null,
    isRead: false,
    ...overrides,
  };
}

describe("resolveNotificationDestination", () => {
  it("routes question_answered to the student question detail screen for a student", () => {
    const result = resolveNotificationDestination(
      notification({ type: "question_answered", entityId: "q1" }),
      "student",
    );
    expect(result).toEqual({ kind: "route", path: "/(student)/question/q1" });
  });

  it("routes question_liked to the student question detail screen", () => {
    const result = resolveNotificationDestination(
      notification({ type: "question_liked", entityId: "q1" }),
      "student",
    );
    expect(result).toEqual({ kind: "route", path: "/(student)/question/q1" });
  });

  it("routes question_commented to the student question detail screen", () => {
    const result = resolveNotificationDestination(
      notification({ type: "question_commented", entityId: "q1" }),
      "student",
    );
    expect(result).toEqual({ kind: "route", path: "/(student)/question/q1" });
  });

  // No teacher question-detail route exists anywhere in this app — see the
  // Phase 15 architecture audit. This must never crash or guess a route.
  it("is unavailable (not a crash, not a guessed route) for a teacher recipient of a question notification", () => {
    const result = resolveNotificationDestination(
      notification({ type: "question_liked", entityId: "q1" }),
      "teacher",
    );
    expect(result.kind).toBe("unavailable");
  });

  it("routes answer_liked using parentEntityId (the question id), not entityId (the answer id)", () => {
    const result = resolveNotificationDestination(
      notification({ type: "answer_liked", entityId: "ans1", parentEntityId: "q1" }),
      "student",
    );
    expect(result).toEqual({ kind: "route", path: "/(student)/question/q1" });
  });

  it("is unavailable for answer_liked when parentEntityId is missing (deleted/legacy entity)", () => {
    const result = resolveNotificationDestination(
      notification({ type: "answer_liked", entityId: "ans1", parentEntityId: null }),
      "student",
    );
    expect(result.kind).toBe("unavailable");
  });

  it("routes friend_request_received to the student friends screen", () => {
    const result = resolveNotificationDestination(
      notification({ type: "friend_request_received" }),
      "student",
    );
    expect(result).toEqual({ kind: "route", path: "/(student)/friends" });
  });

  it("routes friend_request_received to the teacher friends tab", () => {
    const result = resolveNotificationDestination(
      notification({ type: "friend_request_received" }),
      "teacher",
    );
    expect(result).toEqual({ kind: "route", path: "/(teacher)/(tabs)/friends" });
  });

  it("routes friend_request_accepted the same way as friend_request_received", () => {
    const result = resolveNotificationDestination(
      notification({ type: "friend_request_accepted" }),
      "student",
    );
    expect(result).toEqual({ kind: "route", path: "/(student)/friends" });
  });

  it("routes class_student_joined to the teacher class detail screen", () => {
    const result = resolveNotificationDestination(
      notification({ type: "class_student_joined", classId: "c1" }),
      "teacher",
    );
    expect(result).toEqual({ kind: "route", path: "/(teacher)/class/c1" });
  });

  it("is unavailable for class_student_joined with no classId", () => {
    const result = resolveNotificationDestination(
      notification({ type: "class_student_joined", classId: null }),
      "teacher",
    );
    expect(result.kind).toBe("unavailable");
  });

  it("is unavailable for class_student_joined viewed as a student (this type is teacher-only in practice)", () => {
    const result = resolveNotificationDestination(
      notification({ type: "class_student_joined", classId: "c1" }),
      "student",
    );
    expect(result.kind).toBe("unavailable");
  });

  it("never throws for any allowlisted type × either role", () => {
    const types = [
      "question_answered",
      "question_liked",
      "answer_liked",
      "question_commented",
      "friend_request_received",
      "friend_request_accepted",
      "class_student_joined",
    ] as const;
    for (const type of types) {
      for (const role of ["student", "teacher"] as const) {
        expect(() =>
          resolveNotificationDestination(
            notification({ type, classId: "c1", parentEntityId: "q1" }),
            role,
          ),
        ).not.toThrow();
      }
    }
  });
});
