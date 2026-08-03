import {
  buildChatTimeline,
  chatTimelineSignature,
  GROUP_WINDOW_MS,
} from "@features/classes/services/chatTimeline";
import { ChatListMessage, ChatMessageStatus } from "@/types/message";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-03T12:00:00").getTime();

function message(
  overrides: Partial<ChatListMessage> & { id: string; createdAt: number },
): ChatListMessage {
  return {
    clientMessageId: `client-${overrides.id}`,
    classId: "class-1",
    senderId: "student-1",
    senderName: "Öğrenci Bir",
    senderPhoto: null,
    senderRole: "student",
    text: "Merhaba",
    editedAt: null,
    deleted: false,
    ...overrides,
  };
}

function messageItems(timeline: ReturnType<typeof buildChatTimeline>) {
  return timeline.filter((item) => item.type === "message");
}

describe("buildChatTimeline — grouping", () => {
  it("returns an empty timeline for no messages", () => {
    expect(buildChatTimeline([], NOW)).toEqual([]);
  });

  it("marks a lone message as both first and last of its group", () => {
    const timeline = buildChatTimeline([message({ id: "a", createdAt: NOW })], NOW);
    const items = messageItems(timeline);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ isFirstInGroup: true, isLastInGroup: true });
  });

  it("groups consecutive messages from the same sender inside the window", () => {
    const timeline = buildChatTimeline(
      [
        message({ id: "a", createdAt: NOW }),
        message({ id: "b", createdAt: NOW + 60_000 }),
        message({ id: "c", createdAt: NOW + 120_000 }),
      ],
      NOW,
    );
    const items = messageItems(timeline);

    // Ascending order: the first bubble carries the name, the last carries
    // the avatar/timestamp.
    expect(items[0]).toMatchObject({ isFirstInGroup: true, isLastInGroup: false });
    expect(items[1]).toMatchObject({ isFirstInGroup: false, isLastInGroup: false });
    expect(items[2]).toMatchObject({ isFirstInGroup: false, isLastInGroup: true });
  });

  it("never groups messages from different senders", () => {
    const timeline = buildChatTimeline(
      [
        message({ id: "a", createdAt: NOW, senderId: "student-1" }),
        message({ id: "b", createdAt: NOW + 1000, senderId: "teacher-1" }),
      ],
      NOW,
    );
    const items = messageItems(timeline);
    expect(items[0]).toMatchObject({ isFirstInGroup: true, isLastInGroup: true });
    expect(items[1]).toMatchObject({ isFirstInGroup: true, isLastInGroup: true });
  });

  it("breaks the group once the time gap exceeds the window", () => {
    const timeline = buildChatTimeline(
      [
        message({ id: "a", createdAt: NOW }),
        message({ id: "b", createdAt: NOW + GROUP_WINDOW_MS + 1 }),
      ],
      NOW,
    );
    const items = messageItems(timeline);
    expect(items[0]).toMatchObject({ isLastInGroup: true });
    expect(items[1]).toMatchObject({ isFirstInGroup: true });
  });

  it("still groups a pair exactly at the window boundary", () => {
    const timeline = buildChatTimeline(
      [
        message({ id: "a", createdAt: NOW }),
        message({ id: "b", createdAt: NOW + GROUP_WINDOW_MS }),
      ],
      NOW,
    );
    const items = messageItems(timeline);
    expect(items[0]?.type === "message" && items[0].isLastInGroup).toBe(false);
    expect(items[1]?.type === "message" && items[1].isFirstInGroup).toBe(false);
  });

  it("never lets a group span a date separator", () => {
    // Same sender, only a minute apart in wall-clock terms, but on
    // different calendar days — a separator sits between them, so they must
    // not be drawn as one run.
    const yesterdayLateNight = NOW - DAY_MS;
    const timeline = buildChatTimeline(
      [
        message({ id: "a", createdAt: yesterdayLateNight }),
        message({ id: "b", createdAt: NOW }),
      ],
      NOW,
    );
    const items = messageItems(timeline);
    expect(items[0]).toMatchObject({ isFirstInGroup: true, isLastInGroup: true });
    expect(items[1]).toMatchObject({ isFirstInGroup: true, isLastInGroup: true });
  });

  it("does not group an optimistic message with a confirmed one", () => {
    const timeline = buildChatTimeline(
      [
        message({ id: "a", createdAt: NOW }),
        message({ id: "b", createdAt: NOW + 1000, status: "pending" as ChatMessageStatus }),
      ],
      NOW,
    );
    const items = messageItems(timeline);
    expect(items[0]).toMatchObject({ isLastInGroup: true });
    expect(items[1]).toMatchObject({ isFirstInGroup: true });
  });

  it("does not group an out-of-order pair (negative gap)", () => {
    const timeline = buildChatTimeline(
      [message({ id: "a", createdAt: NOW + 5000 }), message({ id: "b", createdAt: NOW })],
      NOW,
    );
    const items = messageItems(timeline);
    expect(items[1]).toMatchObject({ isFirstInGroup: true });
  });

  it("preserves message order and never drops a message", () => {
    const input = [
      message({ id: "a", createdAt: NOW }),
      message({ id: "b", createdAt: NOW + 1000 }),
      message({ id: "c", createdAt: NOW + 2000 }),
    ];
    const ids = messageItems(buildChatTimeline(input, NOW)).map((item) => item.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("keeps the date separators the existing helper produces", () => {
    const timeline = buildChatTimeline(
      [message({ id: "a", createdAt: NOW - DAY_MS }), message({ id: "b", createdAt: NOW })],
      NOW,
    );
    const separators = timeline.filter((item) => item.type === "separator");
    expect(separators).toHaveLength(2);
    expect(separators.map((s) => s.type === "separator" && s.label)).toEqual(["Dün", "Bugün"]);
  });

  it("gives every timeline item a unique, deterministic id", () => {
    const input = [
      message({ id: "a", createdAt: NOW - DAY_MS }),
      message({ id: "b", createdAt: NOW }),
      message({ id: "c", createdAt: NOW + 1000 }),
    ];
    const first = buildChatTimeline(input, NOW).map((item) => item.id);
    const second = buildChatTimeline(input, NOW).map((item) => item.id);

    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it("treats the first message of a newly loaded older page as starting its own group", () => {
    // A conservative pagination boundary: the older page's last message and
    // the live window's first message are far apart, so they never merge.
    const olderPageTail = message({ id: "old", createdAt: NOW - 2 * GROUP_WINDOW_MS });
    const liveHead = message({ id: "new", createdAt: NOW });
    const items = messageItems(buildChatTimeline([olderPageTail, liveHead], NOW));
    expect(items[0]).toMatchObject({ isLastInGroup: true });
    expect(items[1]).toMatchObject({ isFirstInGroup: true });
  });
});

describe("chatTimelineSignature", () => {
  it("is stable for identical content in a fresh array", () => {
    const a = [message({ id: "a", createdAt: NOW })];
    const b = [message({ id: "a", createdAt: NOW })];
    expect(chatTimelineSignature(a)).toBe(chatTimelineSignature(b));
  });

  it("changes when a message is added", () => {
    const before = chatTimelineSignature([message({ id: "a", createdAt: NOW })]);
    const after = chatTimelineSignature([
      message({ id: "a", createdAt: NOW }),
      message({ id: "b", createdAt: NOW + 1000 }),
    ]);
    expect(after).not.toBe(before);
  });

  it("changes when an optimistic message's status changes", () => {
    const pending = chatTimelineSignature([
      message({ id: "a", createdAt: NOW, status: "pending" as ChatMessageStatus }),
    ]);
    const failed = chatTimelineSignature([
      message({ id: "a", createdAt: NOW, status: "failed" as ChatMessageStatus }),
    ]);
    expect(failed).not.toBe(pending);
  });

  it("changes when a pending message's timestamp is replaced by the server value", () => {
    const local = chatTimelineSignature([message({ id: "a", createdAt: NOW })]);
    const confirmed = chatTimelineSignature([message({ id: "a", createdAt: NOW + 250 })]);
    expect(confirmed).not.toBe(local);
  });

  it("is empty for an empty list", () => {
    expect(chatTimelineSignature([])).toBe("");
  });
});
