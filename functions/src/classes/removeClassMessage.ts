import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

// Phase 102 — the authoritative way a class-chat message is removed.
//
// WHAT THIS ADDS
//
// A class conversation had no moderation at all: firestore.rules deny update
// and delete on classes/{classId}/messages for every client, and the
// `deleted` field every message carries was reserved "for a future edit/delete
// feature". This is that feature, in its smallest honest form: the class's
// own teacher may remove a STUDENT'S message from the class's own
// conversation. Nothing else.
//
// WHO MAY, AND WHO MAY NOT
//
// The right is derived from the class document — `classes/{classId}.teacherId`
// — and from the stored message, never from the payload. The client sends
// two ids (the message's path) and nothing forgeable. Consequences, each one
// pinned by tests/integration/removeClassMessage.emulator.test.ts:
//   * a teacher who owns a DIFFERENT class is refused — teaching is not a
//     global right, it is a right in one's own room;
//   * a student is refused, including the message's own author — student
//     self-delete has never existed in this product and is not introduced here;
//   * an organization admin or platform admin is refused — no role is
//     consulted at all, only identity against teacherId, so no admin role
//     gains a right by accident;
//   * the teacher's OWN messages are refused too — this is moderation of
//     student content, not a general delete.
//
// WHAT REMOVAL IS
//
// A soft delete: `deleted: true`, the text cleared, and who/when recorded.
// The document stays so the conversation keeps its shape (position,
// grouping, timestamp) and so a retry after a lost response finds the
// message already removed and reports a quiet success instead of an error.
// `createdAt` and `editedAt` are never touched — removal changes no
// timestamp and rewrites no words; there is no edit, no reason field and no
// impersonation path here by construction.

interface RemoveClassMessageRequest {
  classId?: unknown;
  messageId?: unknown;
}

export interface RemoveClassMessageResult {
  /** True when this call removed the message; false when it was already
   *  removed. Both are successes — see applyRemoveClassMessage. */
  removed: boolean;
}

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && !value.includes("/");

export async function applyRemoveClassMessage(
  db: Firestore,
  callerUid: string | undefined,
  data: RemoveClassMessageRequest | undefined,
): Promise<RemoveClassMessageResult> {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  }

  const classId = data?.classId;
  const messageId = data?.messageId;
  if (!isId(classId)) {
    throw new HttpsError("invalid-argument", "Geçersiz sınıf kimliği.");
  }
  if (!isId(messageId)) {
    throw new HttpsError("invalid-argument", "Geçersiz mesaj kimliği.");
  }

  const classRef = db.collection("classes").doc(classId);
  const messageRef = classRef.collection("messages").doc(messageId);

  return db.runTransaction(async (tx) => {
    const [classSnap, messageSnap] = await Promise.all([tx.get(classRef), tx.get(messageRef)]);

    // The class is checked before the message so a caller who is not this
    // class's teacher learns nothing about what the conversation holds.
    if (!classSnap.exists) {
      throw new HttpsError("not-found", "Sınıf bulunamadı.");
    }
    const classData = classSnap.data() ?? {};
    if (classData.teacherId !== callerUid) {
      throw new HttpsError("permission-denied", "Bu sınıfın mesajlarını yalnızca sınıf öğretmeni kaldırabilir.");
    }

    if (!messageSnap.exists) {
      throw new HttpsError("not-found", "Mesaj bulunamadı.");
    }
    const message = messageSnap.data() ?? {};
    // A message's stored classId always equals its path (the create rule
    // pins it); a mismatch means something outside this product wrote it,
    // and the safe answer is to treat it as not this class's message.
    if (message.classId !== classId) {
      throw new HttpsError("not-found", "Mesaj bulunamadı.");
    }
    if (message.senderRole !== "student" || message.senderId === callerUid) {
      throw new HttpsError("permission-denied", "Yalnızca öğrenci mesajları kaldırılabilir.");
    }

    if (message.deleted === true) {
      return { removed: false };
    }

    tx.update(messageRef, {
      deleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: callerUid,
      text: "",
    });
    return { removed: true };
  });
}

export const removeClassMessage = onCall<RemoveClassMessageRequest>(
  { region: "us-central1" },
  (request) => applyRemoveClassMessage(getFirestore(), request.auth?.uid, request.data),
);
