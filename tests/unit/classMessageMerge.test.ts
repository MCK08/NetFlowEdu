import { mergeClassMessages } from "@features/classes/services/classMessageMerge";
import { ClassMessage } from "@/types/message";

function makeMessage(overrides: Partial<ClassMessage> = {}): ClassMessage {
  return {
    id: "m1",
    clientMessageId: "c1",
    classId: "class-1",
    senderId: "student-1",
    senderName: "Student One",
    senderPhoto: null,
    senderRole: "student",
    text: "Merhaba",
    createdAt: 1000,
    editedAt: null,
    deleted: false,
    ...overrides,
  };
}

describe("mergeClassMessages", () => {
  it("combines older and live messages into one chronologically sorted list", () => {
    const older = [makeMessage({ id: "m1", createdAt: 1000 })];
    const live = [makeMessage({ id: "m2", createdAt: 2000 })];
    const merged = mergeClassMessages(older, live);
    expect(merged.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("deduplicates a message that appears in both sources, preferring the live copy", () => {
    const older = [makeMessage({ id: "m1", createdAt: 1000, text: "eski kopya" })];
    const live = [makeMessage({ id: "m1", createdAt: 1000, text: "canlı kopya" })];
    const merged = mergeClassMessages(older, live);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toBe("canlı kopya");
  });

  it("sorts by createdAt regardless of input order", () => {
    const older = [makeMessage({ id: "m3", createdAt: 3000 })];
    const live = [makeMessage({ id: "m1", createdAt: 1000 }), makeMessage({ id: "m2", createdAt: 2000 })];
    const merged = mergeClassMessages(older, live);
    expect(merged.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("returns an empty array when both inputs are empty", () => {
    expect(mergeClassMessages([], [])).toEqual([]);
  });
});
