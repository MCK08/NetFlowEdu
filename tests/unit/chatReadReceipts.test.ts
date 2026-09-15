import {
  latestOwnMessage,
  seenCount,
  seenLabel,
  SEEN_LABEL,
  shouldMarkRead,
} from "@features/classes/services/chatReadReceipts";
import { ChatListMessage } from "@/types/message";

// Phase 102 — the pure half of "Görüldü". The class chat is a GROUP, so
// every rule here is about per-recipient cursors, never one seenAt.

const ME = "teacher-1";
const A = "student-a";
const B = "student-b";
const T = 1_700_000_000_000;

function msg(over: Partial<ChatListMessage> & { id: string; createdAt: number }): ChatListMessage {
  return {
    clientMessageId: `c-${over.id}`, classId: "class-1", senderId: ME, senderName: "Ben",
    senderPhoto: null, senderRole: "teacher", text: "merhaba", editedAt: null, deleted: false,
    ...over,
  };
}
const cursor = (uid: string, lastReadMessageId: string, lastReadAt: number) => ({ uid, lastReadMessageId, lastReadAt });

describe("latestOwnMessage — the one bubble that carries the label", () => {
  it("is the sender's newest confirmed message, skipping others' messages", () => {
    const messages = [
      msg({ id: "m1", createdAt: T }),
      msg({ id: "m2", createdAt: T + 1, senderId: A, senderRole: "student" }),
      msg({ id: "m3", createdAt: T + 2 }),
      msg({ id: "m4", createdAt: T + 3, senderId: B, senderRole: "student" }),
    ];
    expect(latestOwnMessage(messages, ME)?.id).toBe("m3");
    expect(latestOwnMessage(messages, A)?.id).toBe("m2");
  });

  it("ignores pending, failed, removed and timestamp-less messages", () => {
    const messages = [
      msg({ id: "m1", createdAt: T }),
      msg({ id: "m2", createdAt: T + 1, deleted: true, text: "" }),
      msg({ id: "local-1", createdAt: T + 2, status: "pending" }),
      msg({ id: "local-2", createdAt: T + 3, status: "failed" }),
      msg({ id: "m5", createdAt: 0 }),
    ];
    expect(latestOwnMessage(messages, ME)?.id).toBe("m1");
  });

  it("is null with no viewer, no messages, or none of the viewer's own", () => {
    expect(latestOwnMessage([msg({ id: "m1", createdAt: T })], undefined)).toBeNull();
    expect(latestOwnMessage([], ME)).toBeNull();
    expect(latestOwnMessage([msg({ id: "m1", createdAt: T, senderId: A })], ME)).toBeNull();
  });
});

describe("seenCount — per recipient, never the sender", () => {
  const message = { id: "m3", senderId: ME, createdAt: T + 2 };

  it("counts a cursor at the message and a cursor past it; not one before it", () => {
    expect(seenCount(message, [cursor(A, "m3", T + 2)])).toBe(1);
    expect(seenCount(message, [cursor(A, "m9", T + 50)])).toBe(1);
    expect(seenCount(message, [cursor(A, "m1", T)])).toBe(0);
  });

  it("adds one per recipient in a group — three readers is three", () => {
    expect(
      seenCount(message, [cursor(A, "m3", T + 2), cursor(B, "m4", T + 3), cursor("student-c", "m3", T + 2)]),
    ).toBe(3);
  });

  it("never counts the sender's own cursor", () => {
    expect(seenCount(message, [cursor(ME, "m3", T + 2)])).toBe(0);
    expect(seenCount(message, [cursor(ME, "m3", T + 2), cursor(A, "m3", T + 2)])).toBe(1);
  });

  it("matches by id even if the stored time were somehow earlier", () => {
    expect(seenCount(message, [cursor(A, "m3", 0)])).toBe(1);
  });

  it("is zero with no cursors", () => {
    expect(seenCount(message, [])).toBe(0);
  });
});

describe("seenLabel", () => {
  it('is "Görüldü" for one reader, "Görüldü · N" for several, nothing for none', () => {
    expect(seenLabel(0)).toBeNull();
    expect(seenLabel(-1)).toBeNull();
    expect(seenLabel(1)).toBe(SEEN_LABEL);
    expect(seenLabel(1)).toBe("Görüldü");
    expect(seenLabel(2)).toBe("Görüldü · 2");
    expect(seenLabel(12)).toBe("Görüldü · 12");
  });
});

describe("shouldMarkRead — one write per newest-message change, monotonic, idempotent", () => {
  const newest = { id: "m3", createdAt: T + 2 };

  it("writes when the member has no cursor yet", () => {
    expect(shouldMarkRead(null, newest)).toBe(true);
    expect(shouldMarkRead(undefined, newest)).toBe(true);
  });

  it("does not write when the cursor is already at the newest message (idempotent re-focus)", () => {
    expect(shouldMarkRead(cursor(A, "m3", T + 2), newest)).toBe(false);
  });

  it("writes when the newest message is later than the cursor", () => {
    expect(shouldMarkRead(cursor(A, "m1", T), newest)).toBe(true);
  });

  it("never moves the cursor backwards", () => {
    expect(shouldMarkRead(cursor(A, "m9", T + 50), newest)).toBe(false);
    expect(shouldMarkRead(cursor(A, "m8", T + 2), { id: "m7", createdAt: T + 2 })).toBe(false);
  });

  it("writes nothing for an empty conversation or a message without a server time", () => {
    expect(shouldMarkRead(null, null)).toBe(false);
    expect(shouldMarkRead(null, { id: "local-1", createdAt: 0 })).toBe(false);
  });
});
