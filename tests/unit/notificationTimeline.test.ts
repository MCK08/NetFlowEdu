import { groupNotificationsByRecency } from "@features/notifications/services/notificationTimeline";
import { NotificationRecord } from "@/types/notification";

const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime(); // 2026-01-15 noon
const TODAY_9AM = new Date(2026, 0, 15, 9, 0, 0).getTime();
const YESTERDAY_9AM = new Date(2026, 0, 14, 9, 0, 0).getTime();
const LAST_WEEK = new Date(2026, 0, 8, 9, 0, 0).getTime();

function notification(id: string, createdAt: number): NotificationRecord {
  return {
    id,
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
    createdAt,
    readAt: null,
    isRead: false,
  };
}

describe("groupNotificationsByRecency", () => {
  it("buckets today/yesterday/older correctly", () => {
    const sections = groupNotificationsByRecency(
      [notification("today", TODAY_9AM), notification("yesterday", YESTERDAY_9AM), notification("old", LAST_WEEK)],
      NOW,
    );
    expect(sections.map((s) => s.key)).toEqual(["today", "yesterday", "older"]);
    expect(sections[0]?.data.map((n) => n.id)).toEqual(["today"]);
    expect(sections[1]?.data.map((n) => n.id)).toEqual(["yesterday"]);
    expect(sections[2]?.data.map((n) => n.id)).toEqual(["old"]);
  });

  it("omits empty sections entirely", () => {
    const sections = groupNotificationsByRecency([notification("today", TODAY_9AM)], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.key).toBe("today");
  });

  it("returns an empty array for an empty input", () => {
    expect(groupNotificationsByRecency([], NOW)).toEqual([]);
  });

  it("preserves input order within a section (already createdAt-desc from the query)", () => {
    const first = notification("first", TODAY_9AM + 3000);
    const second = notification("second", TODAY_9AM + 1000);
    const sections = groupNotificationsByRecency([first, second], NOW);
    expect(sections[0]?.data.map((n) => n.id)).toEqual(["first", "second"]);
  });

  it("uses Turkish labels", () => {
    const sections = groupNotificationsByRecency(
      [notification("t", TODAY_9AM), notification("y", YESTERDAY_9AM), notification("o", LAST_WEEK)],
      NOW,
    );
    expect(sections.map((s) => s.label)).toEqual(["Bugün", "Dün", "Daha Önce"]);
  });
});
