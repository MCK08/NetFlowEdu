import {
  applyMarkAllReadTransition,
  applyReadTransition,
  dedupeNotificationsById,
  mergeNotificationPages,
  revertReadTransition,
  willTransitionToRead,
} from "@features/notifications/services/notificationMerge";
import { NotificationRecord } from "@/types/notification";

function notification(id: string, isRead = false): NotificationRecord {
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
    createdAt: 1,
    readAt: null,
    isRead,
  };
}

describe("mergeNotificationPages", () => {
  it("appends new pages without dropping existing entries", () => {
    const merged = mergeNotificationPages([notification("a")], [notification("b")]);
    expect(merged.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("drops duplicates already present (overlapping cursor page)", () => {
    const merged = mergeNotificationPages([notification("a")], [notification("a"), notification("b")]);
    expect(merged.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("returns the existing array reference untouched when incoming is empty", () => {
    const existing = [notification("a")];
    expect(mergeNotificationPages(existing, [])).toBe(existing);
  });
});

describe("dedupeNotificationsById", () => {
  it("keeps the first occurrence and drops later duplicates", () => {
    const a1 = notification("a", false);
    const a2 = notification("a", true);
    const result = dedupeNotificationsById([a1, a2]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(a1);
  });
});

describe("applyReadTransition", () => {
  it("marks exactly the target notification as read", () => {
    const list = [notification("a"), notification("b")];
    const next = applyReadTransition(list, "a", 1000);
    expect(next.find((n) => n.id === "a")?.isRead).toBe(true);
    expect(next.find((n) => n.id === "a")?.readAt).toBe(1000);
    expect(next.find((n) => n.id === "b")?.isRead).toBe(false);
  });

  it("is a no-op (same reference) for an unknown id", () => {
    const list = [notification("a")];
    expect(applyReadTransition(list, "missing", 1000)).toBe(list);
  });

  it("is a no-op (same reference, idempotent) when already read — double-tap safety", () => {
    const list = [notification("a", true)];
    expect(applyReadTransition(list, "a", 2000)).toBe(list);
  });
});

describe("applyMarkAllReadTransition", () => {
  it("marks every unread entry as read", () => {
    const list = [notification("a", false), notification("b", false)];
    const next = applyMarkAllReadTransition(list, 5000);
    expect(next.every((n) => n.isRead)).toBe(true);
  });

  it("leaves an already-read entry's readAt untouched-equivalent (still read, no crash) while updating unread ones", () => {
    const list = [notification("a", true), notification("b", false)];
    const next = applyMarkAllReadTransition(list, 5000);
    expect(next.find((n) => n.id === "a")?.isRead).toBe(true);
    expect(next.find((n) => n.id === "b")?.isRead).toBe(true);
  });

  it("is a no-op (same reference) when everything is already read", () => {
    const list = [notification("a", true)];
    expect(applyMarkAllReadTransition(list, 1000)).toBe(list);
  });
});

describe("willTransitionToRead — the pure predicate that keeps the state updater pure", () => {
  it("is true for a known unread notification", () => {
    expect(willTransitionToRead([notification("a", false)], "a")).toBe(true);
  });

  it("is false for an already-read notification (repeat tap must not decrement the badge)", () => {
    expect(willTransitionToRead([notification("a", true)], "a")).toBe(false);
  });

  it("is false for an unknown id", () => {
    expect(willTransitionToRead([notification("a", false)], "missing")).toBe(false);
  });

  it("agrees exactly with whether applyReadTransition actually changes the array", () => {
    const cases = [
      { list: [notification("a", false)], id: "a" },
      { list: [notification("a", true)], id: "a" },
      { list: [notification("a", false)], id: "missing" },
      { list: [] as ReturnType<typeof notification>[], id: "a" },
    ];
    for (const { list, id } of cases) {
      const changed = applyReadTransition(list, id, 1) !== list;
      expect(willTransitionToRead(list, id)).toBe(changed);
    }
  });
});

describe("revertReadTransition — optimistic mark-read rollback", () => {
  it("puts a notification back to unread and restores its previous readAt", () => {
    const optimistic = applyReadTransition([notification("a", false)], "a", 5000);
    expect(optimistic[0]?.isRead).toBe(true);

    const reverted = revertReadTransition(optimistic, "a", null);
    expect(reverted[0]?.isRead).toBe(false);
    expect(reverted[0]?.readAt).toBeNull();
  });

  it("restores a non-null previous readAt exactly", () => {
    const list = [{ ...notification("a", true), readAt: 1234 }];
    const optimistic = list.map((n) => ({ ...n, isRead: true, readAt: 9999 }));
    const reverted = revertReadTransition(optimistic, "a", 1234);
    expect(reverted[0]?.readAt).toBe(1234);
  });

  it("only touches the target — other rows are left exactly as they were", () => {
    const list = [notification("a", true), notification("b", true)];
    const reverted = revertReadTransition(list, "a", null);
    expect(reverted.find((n) => n.id === "a")?.isRead).toBe(false);
    expect(reverted.find((n) => n.id === "b")?.isRead).toBe(true);
  });

  it("is a no-op (same reference) for an unknown id", () => {
    const list = [notification("a", true)];
    expect(revertReadTransition(list, "missing", null)).toBe(list);
  });

  it("is a no-op (same reference) when the entry is already unread — a duplicated rollback can never flip a legitimately-read row back", () => {
    const list = [notification("a", false)];
    expect(revertReadTransition(list, "a", null)).toBe(list);
  });

  it("round-trips: apply then revert returns to the original read state", () => {
    const original = [notification("a", false), notification("b", true)];
    const optimistic = applyReadTransition(original, "a", 7777);
    const reverted = revertReadTransition(optimistic, "a", null);
    expect(reverted.map((n) => ({ id: n.id, isRead: n.isRead, readAt: n.readAt }))).toEqual(
      original.map((n) => ({ id: n.id, isRead: n.isRead, readAt: n.readAt })),
    );
  });
});
