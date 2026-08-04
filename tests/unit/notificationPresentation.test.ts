import {
  notificationAccessibilityLabel,
  presentNotification,
} from "@features/notifications/services/notificationPresentation";
import { NOTIFICATION_TYPES, NotificationRecord } from "@/types/notification";

function baseNotification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: "n1",
    recipientId: "r1",
    actorId: "a1",
    actorDisplayName: "Ayşe",
    actorUsername: "ayse",
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

describe("presentNotification", () => {
  it("covers every allowlisted notification type without throwing", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(() => presentNotification(baseNotification({ type }))).not.toThrow();
    }
  });

  it("includes the actor's display name in the title", () => {
    const result = presentNotification(baseNotification({ actorDisplayName: "Mehmet" }));
    expect(result.title).toContain("Mehmet");
  });

  it("falls back to a generic label when actorDisplayName is empty", () => {
    const result = presentNotification(baseNotification({ actorDisplayName: "" }));
    expect(result.title).toContain("Bir kullanıcı");
  });

  it("surfaces the class name as secondary text only for class_student_joined", () => {
    const result = presentNotification(
      baseNotification({ type: "class_student_joined", messagePreview: "10-A Matematik" }),
    );
    expect(result.secondaryText).toBe("10-A Matematik");
  });

  it("has no secondary text for question_liked", () => {
    const result = presentNotification(baseNotification({ type: "question_liked" }));
    expect(result.secondaryText).toBeNull();
  });
});

describe("notificationAccessibilityLabel", () => {
  it("states unread state explicitly for an unread notification", () => {
    const notification = baseNotification({ isRead: false });
    const presentation = presentNotification(notification);
    expect(notificationAccessibilityLabel(notification, presentation)).toContain("Okunmadı.");
  });

  it("states read state explicitly for a read notification", () => {
    const notification = baseNotification({ isRead: true });
    const presentation = presentNotification(notification);
    expect(notificationAccessibilityLabel(notification, presentation)).toContain("Okundu.");
  });
});
