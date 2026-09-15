import fs from "fs";
import path from "path";

import {
  canRemoveMessage,
  mapRemoveMessageError,
  REMOVE_MESSAGE_ACTION_LABEL,
  REMOVE_MESSAGE_CANCEL_LABEL,
  REMOVE_MESSAGE_CONFIRM_LABEL,
  REMOVE_MESSAGE_CONFIRM_TITLE,
  REMOVED_MESSAGE_PLACEHOLDER,
  RemoveMessageError,
  removeMessageErrorMessage,
} from "@features/classes/services/messageModeration";

// Phase 102 — class-teacher message moderation, the client half.
//
// The server (functions/src/classes/removeClassMessage.ts, proven against the
// emulator in tests/integration/removeClassMessage.emulator.test.ts) decides
// who may remove what. What is pinned here is what the client draws and
// says, and the structural contract that no client write path exists.

const REPO = path.join(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(REPO, p), "utf8");

const teacher = { uid: "teacher-1", role: "teacher" as const };
const student = { uid: "student-a", role: "student" as const };
const studentMessage = { senderId: "student-b", senderRole: "student" as const, deleted: false };

describe("copy", () => {
  it("is the mandated wording, and none of it carries an id or a reason field", () => {
    expect(REMOVE_MESSAGE_ACTION_LABEL).toBe("Mesajı kaldır");
    expect(REMOVE_MESSAGE_CONFIRM_TITLE).toBe("Bu öğrenci mesajını kaldırmak istiyor musun?");
    expect(REMOVE_MESSAGE_CONFIRM_LABEL).toBe("Kaldır");
    expect(REMOVE_MESSAGE_CANCEL_LABEL).toBe("Vazgeç");
    expect(REMOVED_MESSAGE_PLACEHOLDER).toBe("Bu mesaj öğretmen tarafından kaldırıldı.");
    for (const code of ["unauthenticated", "not-class-teacher", "not-found", "unavailable"] as const) {
      const text = removeMessageErrorMessage(code);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/[A-Za-z0-9]{20,}/); // no ids
      expect(text).not.toMatch(/functions\//);
    }
  });

  it("keeps the three refusals apart — each needs a different next action", () => {
    const messages = new Set(
      (["unauthenticated", "not-class-teacher", "not-found", "unavailable"] as const).map(removeMessageErrorMessage),
    );
    expect(messages.size).toBe(4);
    expect(removeMessageErrorMessage("not-class-teacher")).toContain("yalnızca sınıfın öğretmeni");
  });
});

describe("mapRemoveMessageError", () => {
  it("maps Functions codes; anything else is a retryable connectivity failure", () => {
    expect(mapRemoveMessageError("functions/unauthenticated")).toBe("unauthenticated");
    expect(mapRemoveMessageError("functions/permission-denied")).toBe("not-class-teacher");
    expect(mapRemoveMessageError("functions/not-found")).toBe("not-found");
    expect(mapRemoveMessageError("functions/invalid-argument")).toBe("not-found");
    expect(mapRemoveMessageError("functions/unavailable")).toBe("unavailable");
    expect(mapRemoveMessageError("functions/internal")).toBe("unavailable");
    expect(mapRemoveMessageError(undefined)).toBe("unavailable");
    expect(new RemoveMessageError("not-found").code).toBe("not-found");
  });
});

describe("canRemoveMessage — what the teacher's long-press is offered on", () => {
  it("a teacher, on another person's confirmed student message", () => {
    expect(canRemoveMessage(teacher, studentMessage)).toBe(true);
  });

  it("never a student — not on their own message, not on anyone's", () => {
    expect(canRemoveMessage(student, studentMessage)).toBe(false);
    expect(canRemoveMessage(student, { ...studentMessage, senderId: student.uid })).toBe(false);
    expect(canRemoveMessage(null, studentMessage)).toBe(false);
  });

  it("not on a teacher's message, including the viewer's own", () => {
    expect(canRemoveMessage(teacher, { senderId: teacher.uid, senderRole: "teacher", deleted: false })).toBe(false);
    expect(canRemoveMessage(teacher, { senderId: "teacher-2", senderRole: "teacher", deleted: false })).toBe(false);
  });

  it("not on a message that is already removed, or one still pending/failed", () => {
    expect(canRemoveMessage(teacher, { ...studentMessage, deleted: true })).toBe(false);
    expect(canRemoveMessage(teacher, { ...studentMessage, status: "pending" })).toBe(false);
    expect(canRemoveMessage(teacher, { ...studentMessage, status: "failed" })).toBe(false);
  });
});

describe("structural contract — removal is server-authoritative and nothing else moves", () => {
  it("the client service performs no Firestore write for removal; it calls the callable", () => {
    const service = read("src/services/firebase/functions.ts");
    expect(service).toMatch(/httpsCallable<\{ classId: string; messageId: string \}, \{ removed: boolean \}>\(\s*functions,\s*"removeClassMessage",/);
    const messages = read("src/services/firebase/classMessages.ts");
    expect(messages).not.toMatch(/deleted:\s*true/);
    expect(messages).not.toMatch(/updateDoc|deleteDoc/);
  });

  it("firestore.rules keep every client update and delete on messages denied", () => {
    const rules = read("firestore.rules");
    const block = rules.slice(rules.indexOf("match /classes/{classId}/messages/{messageId}"));
    const end = block.indexOf("match /classes/{classId}/chatReads");
    const messagesBlock = block.slice(0, end);
    expect(messagesBlock).toContain("allow update: if false;");
    expect(messagesBlock).toContain("allow delete: if false;");
  });

  it("the callable is exported once, from the classes barrel, and derives rights from stored data only", () => {
    expect(read("functions/src/index.ts")).toMatch(/removeClassMessage,\s*\} from "\.\/classes"/);
    const fn = read("functions/src/classes/removeClassMessage.ts");
    expect(fn).toContain("classData.teacherId !== callerUid");
    expect(fn).toContain('message.senderRole !== "student" || message.senderId === callerUid');
    // No role claim is consulted: an org admin or platform admin gains nothing.
    expect(fn).not.toMatch(/request\.auth\?\.token|token\.role|customClaims|role ===/);
    // Removal touches exactly these fields — no text rewrite, no timestamp change.
    expect(fn).toMatch(/tx\.update\(messageRef, \{\s*deleted: true,\s*deletedAt: FieldValue\.serverTimestamp\(\),\s*deletedBy: callerUid,\s*text: "",\s*\}\)/);
    expect(fn).not.toMatch(/createdAt:|editedAt:|senderName:|senderId:/);
  });

  it("the bubble offers the action as a long-press only — no button, no danger colour", () => {
    const bubble = read("src/features/classes/components/ChatMessageBubble.tsx");
    expect(bubble).toContain("onLongPress={offersRemove ?");
    expect(bubble).not.toMatch(/Mesajı kaldır.*accessibilityRole="button"/s);
    const sheet = read("src/features/classes/components/RemoveMessageSheet.tsx");
    expect(sheet).not.toMatch(/danger|#[Ff]{3}\b|"red"/);
    expect(sheet).not.toMatch(/TextInput|reason:|sebep/i);
  });
});
