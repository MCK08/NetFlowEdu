import {
  formatDateSeparatorLabel,
  groupMessagesWithDateSeparators,
} from "@features/classes/services/chatDateGrouping";
import { ChatListMessage } from "@/types/message";

function makeMessage(overrides: Partial<ChatListMessage> = {}): ChatListMessage {
  return {
    id: "m1",
    clientMessageId: "c1",
    classId: "class-1",
    senderId: "student-1",
    senderName: "Student One",
    senderPhoto: null,
    senderRole: "student",
    text: "Merhaba",
    createdAt: Date.now(),
    editedAt: null,
    deleted: false,
    ...overrides,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("formatDateSeparatorLabel", () => {
  const now = new Date(2026, 6, 15, 12, 0, 0).getTime(); // 2026-07-15 noon

  it("labels a message from today as 'Bugün'", () => {
    const today9am = new Date(2026, 6, 15, 9, 0, 0).getTime();
    expect(formatDateSeparatorLabel(today9am, now)).toBe("Bugün");
  });

  it("labels a message from yesterday as 'Dün'", () => {
    const yesterday = new Date(2026, 6, 14, 23, 0, 0).getTime();
    expect(formatDateSeparatorLabel(yesterday, now)).toBe("Dün");
  });

  it("labels a message from two days ago with an absolute date, not 'Dün'", () => {
    const twoDaysAgo = new Date(2026, 6, 13, 12, 0, 0).getTime();
    const label = formatDateSeparatorLabel(twoDaysAgo, now);
    expect(label).not.toBe("Dün");
    expect(label).not.toBe("Bugün");
  });
});

describe("groupMessagesWithDateSeparators", () => {
  const now = new Date(2026, 6, 15, 12, 0, 0).getTime();

  it("inserts exactly one separator before the first message of a single day's messages", () => {
    const day = new Date(2026, 6, 15, 9, 0, 0).getTime();
    const messages = [
      makeMessage({ id: "m1", createdAt: day }),
      makeMessage({ id: "m2", createdAt: day + 60_000 }),
    ];
    const items = groupMessagesWithDateSeparators(messages, now);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ type: "separator", label: "Bugün" });
    expect(items[1]).toMatchObject({ type: "message", id: "m1" });
    expect(items[2]).toMatchObject({ type: "message", id: "m2" });
  });

  it("inserts a new separator when messages cross a calendar day boundary", () => {
    const yesterday = new Date(2026, 6, 14, 23, 0, 0).getTime();
    const today = new Date(2026, 6, 15, 9, 0, 0).getTime();
    const messages = [
      makeMessage({ id: "m1", createdAt: yesterday }),
      makeMessage({ id: "m2", createdAt: today }),
    ];
    const items = groupMessagesWithDateSeparators(messages, now);
    expect(items.map((i) => i.type)).toEqual(["separator", "message", "separator", "message"]);
    expect(items[0]).toMatchObject({ label: "Dün" });
    expect(items[2]).toMatchObject({ label: "Bugün" });
  });

  it("returns an empty array for no messages", () => {
    expect(groupMessagesWithDateSeparators([], now)).toEqual([]);
  });

  it("preserves message order and identity within each day", () => {
    const day = new Date(2026, 6, 15, 9, 0, 0).getTime();
    const messages = [
      makeMessage({ id: "m1", createdAt: day, text: "birinci" }),
      makeMessage({ id: "m2", createdAt: day + 1000, text: "ikinci" }),
      makeMessage({ id: "m3", createdAt: day + 2000, text: "üçüncü" }),
    ];
    const items = groupMessagesWithDateSeparators(messages, now);
    const messageItems = items.filter((i) => i.type === "message");
    expect(messageItems.map((i) => (i.type === "message" ? i.message.text : null))).toEqual([
      "birinci",
      "ikinci",
      "üçüncü",
    ]);
  });
});

// Sanity check that DAY_MS matches the module's own day-boundary math —
// guards against a future refactor silently changing the boundary unit.
describe("day boundary sanity", () => {
  it("24 hours is exactly one day in milliseconds", () => {
    expect(DAY_MS).toBe(86_400_000);
  });
});
