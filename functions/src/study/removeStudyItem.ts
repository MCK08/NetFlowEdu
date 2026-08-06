import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import type { Transaction } from "firebase-admin/firestore";

import { STUDY_SCHEMA_VERSION } from "./studyTypes";

// "Çalışma planından kaldır" — the escape hatch for a study item the student
// no longer wants, and the only way out of an item whose question has been
// deleted or whose access was revoked (the queue can otherwise show it
// forever, since the item itself is still perfectly valid data).
//
// Deliberately conservative about history:
//   * studyDays documents are NEVER touched — those record what actually
//     happened on a given day, and rewriting them would corrupt the streak
//     and the daily charts retroactively.
//   * totalReviewActions is NEVER decremented — the student really did
//     perform those reviews.
//   * currentStreak / longestStreak are NEVER touched.
// Only the forward-looking counters (totalUniqueQuestions, masteredCount)
// shrink, because those describe the CURRENT plan, not history.
export const removeStudyItem = onCall<{ questionId: string }>(
  { region: "us-central1" },
  async (request): Promise<{ removed: boolean }> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    if (caller.token.role !== "student") {
      throw new HttpsError("permission-denied", "Çalışma planı yalnızca öğrenciler içindir.");
    }

    const questionId = request.data?.questionId;
    if (typeof questionId !== "string" || questionId.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz soru kimliği.");
    }

    const now = Date.now();
    const db = getFirestore();
    // Scoped to the caller's own subcollection — there is no path by which
    // one student can name another student's item.
    const itemRef = db.collection("users").doc(caller.uid).collection("studyItems").doc(questionId);
    const summaryRef = db.collection("users").doc(caller.uid).collection("studyMeta").doc("summary");

    return db.runTransaction(async (tx: Transaction) => {
      // ---------------- READ PHASE ----------------
      const [itemSnap, summarySnap] = await Promise.all([tx.get(itemRef), tx.get(summaryRef)]);

      // Idempotent: removing something already gone is a success, not an
      // error — a double-tap or a retry must not surface a failure.
      if (!itemSnap.exists) {
        return { removed: false };
      }

      const item = itemSnap.data() ?? {};
      const wasMastered = item.status === "mastered";
      const summary = summarySnap.exists ? (summarySnap.data() ?? {}) : {};
      const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

      // ---------------- WRITE PHASE ----------------
      tx.delete(itemRef);
      tx.set(
        summaryRef,
        {
          // Floored: a corrupted or absent legacy counter must never go
          // negative just because an item was removed.
          totalUniqueQuestions: Math.max(0, num(summary.totalUniqueQuestions) - 1),
          masteredCount: Math.max(0, num(summary.masteredCount) - (wasMastered ? 1 : 0)),
          schemaVersion: STUDY_SCHEMA_VERSION,
          updatedAt: now,
        },
        // merge:true so streak/goal/history fields this function does not
        // own are left exactly as they were.
        { merge: true },
      );

      return { removed: true };
    });
  },
);
