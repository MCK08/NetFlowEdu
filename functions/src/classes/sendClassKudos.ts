import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { commitNotification, prepareNotification } from "../notifications/createNotification";

// Phase 110 — "Tebrik Et": one classmate congratulating another for a question
// they shared in their class.
//
// ONE SMALL, SAFE INTERACTION
//
// There is exactly one target (a class question a classmate shared) and one
// gesture. No reaction set, no counter, no free text. The recipient hears about
// it through the existing notification inbox; the sender keeps a private record
// so their button can say "Tebrik edildi". Nothing is ever totalled where anyone
// else can see it — see firestore.rules users/{uid}/sentKudos.
//
// WHO MAY, AND WHO MAY NOT
//
// Every right is derived server-side, never from the payload. The client sends
// two ids — the class and the question — and nothing forgeable: the sender is
// the authenticated caller and the recipient is the question's stored owner.
//   * the sender must be a CURRENT student member of the class;
//   * the question must be a class question of THAT class;
//   * its owner must still be a student member of the same class — so a
//     teacher's question, a departed student's question, or a question from
//     another class is never a target;
//   * nobody congratulates themselves;
//   * an archived class is quiet — nothing new is sent in it.
//
// IDEMPOTENT BY CONSTRUCTION
//
// The sender's record id is derived from the target, and the notification id is
// the shared dedupe key (recipient, type, sender, question). A second tap, a
// retry after a lost response, or a replay all resolve to the SAME documents:
// the first call reports "sent", every later one "already_sent", and the
// recipient receives exactly one notification.

interface SendClassKudosRequest {
  classId?: unknown;
  questionId?: unknown;
}

export type SendClassKudosStatus = "sent" | "already_sent";

export interface SendClassKudosResult {
  status: SendClassKudosStatus;
}

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("/");

/** The sender's own record id for one target. The path already scopes it to
 *  the sender, so the target alone makes it one-per-sender-per-target. */
export function buildSentKudosId(questionId: string): string {
  return `question__${questionId}`;
}

export async function applySendClassKudos(
  db: Firestore,
  callerUid: string | undefined,
  data: SendClassKudosRequest | undefined,
): Promise<SendClassKudosResult> {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  }
  const classId = data?.classId;
  const questionId = data?.questionId;
  if (!isId(classId)) {
    throw new HttpsError("invalid-argument", "Geçersiz sınıf kimliği.");
  }
  if (!isId(questionId)) {
    throw new HttpsError("invalid-argument", "Geçersiz soru kimliği.");
  }

  const classRef = db.collection("classes").doc(classId);
  const senderMemberRef = classRef.collection("members").doc(callerUid);
  const questionRef = db.collection("questions").doc(questionId);
  const sentRef = db.collection("users").doc(callerUid).collection("sentKudos").doc(buildSentKudosId(questionId));

  return db.runTransaction(async (tx) => {
    // ── READ PHASE: every read precedes every write (see createNotification.ts).
    const [classSnap, senderSnap, questionSnap, sentSnap] = await Promise.all([
      tx.get(classRef),
      tx.get(senderMemberRef),
      tx.get(questionRef),
      tx.get(sentRef),
    ]);

    // The class and the caller's membership are checked before anything about
    // the question, so a non-member learns nothing about the class's content.
    if (!classSnap.exists) {
      throw new HttpsError("not-found", "Sınıf bulunamadı.");
    }
    const classData = classSnap.data() ?? {};
    if (!senderSnap.exists || senderSnap.data()?.role !== "student") {
      throw new HttpsError("permission-denied", "Yalnızca bu sınıfın öğrencileri tebrik gönderebilir.");
    }
    if (classData.status === "archived") {
      throw new HttpsError("failed-precondition", "Arşivlenmiş bir sınıfta tebrik gönderilemez.");
    }

    const question = questionSnap.exists ? questionSnap.data() ?? {} : null;
    if (!question || question.visibility !== "class" || question.classId !== classId) {
      throw new HttpsError("not-found", "Soru bulunamadı.");
    }
    const recipientId = question.ownerId;
    if (!isId(recipientId)) {
      throw new HttpsError("not-found", "Soru bulunamadı.");
    }
    if (recipientId === callerUid) {
      throw new HttpsError("invalid-argument", "Kendi paylaştığın soru için tebrik gönderemezsin.");
    }

    const recipientSnap = await tx.get(classRef.collection("members").doc(recipientId));
    if (!recipientSnap.exists || recipientSnap.data()?.role !== "student") {
      throw new HttpsError(
        "failed-precondition",
        "Yalnızca sınıf arkadaşlarının paylaştığı sorular için tebrik gönderilebilir.",
      );
    }

    if (sentSnap.exists) {
      return { status: "already_sent" };
    }

    const className = typeof classData.name === "string" ? classData.name.slice(0, 80) : null;
    const plan = await prepareNotification(tx, db, {
      recipientId,
      actorId: callerUid,
      type: "class_kudos_received",
      entityType: "question",
      entityId: questionId,
      classId,
      messagePreview: className,
    });

    // ── WRITE PHASE.
    tx.set(sentRef, {
      classId,
      targetType: "question",
      targetId: questionId,
      recipientId,
      createdAt: FieldValue.serverTimestamp(),
    });
    commitNotification(tx, plan);
    return { status: "sent" };
  });
}

export const sendClassKudos = onCall<SendClassKudosRequest>(
  { region: "us-central1" },
  (request) => applySendClassKudos(getFirestore(), request.auth?.uid, request.data),
);
