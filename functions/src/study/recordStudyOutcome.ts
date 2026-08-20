import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

import { canReadQuestion } from "../social/questionAccess";
import { advanceStreak, resolveTimeZone, toDayKey } from "./dayKey";
import { appendOperationId, hasProcessedOperation, isValidOperationId } from "./operationId";
import { isStudyOutcome, scheduleNextReview, StudyOutcome } from "./reviewScheduler";
import {
  DEFAULT_DAILY_GOAL,
  incrementOutcomeCounters,
  STUDY_SCHEMA_VERSION,
  StudySource,
} from "./studyTypes";

interface RecordStudyOutcomeRequest {
  questionId: string;
  outcome: StudyOutcome;
  timeZone?: string;
  // Per-gesture replay guard — see operationId.ts. Optional so an older
  // client keeps working (it simply gets no dedupe protection).
  operationId?: string;
}

interface RecordStudyOutcomeResult {
  status: string;
  intervalDays: number;
  successfulReviews: number;
  nextReviewAt: number;
  reviewedToday: number;
  dailyGoal: number;
  goalCompleted: boolean;
  currentStreak: number;
}

function studyItemRef(db: Firestore, uid: string, questionId: string): DocumentReference {
  return db.collection("users").doc(uid).collection("studyItems").doc(questionId);
}

function studySummaryRef(db: Firestore, uid: string): DocumentReference {
  return db.collection("users").doc(uid).collection("studyMeta").doc("summary");
}

function studyDayRef(db: Firestore, uid: string, dayKey: string): DocumentReference {
  return db.collection("users").doc(uid).collection("studyDays").doc(dayKey);
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// The single write path for "the student reported how a question went".
//
// Student-only by design (see the role check below): the review queue is a
// learner tool, and a teacher has no study items. This mirrors
// joinClassByCode's student-only guard rather than inventing a new pattern.
//
// The transaction is explicitly two-phase. Firestore rejects any read
// issued after the first write, and this exact rule caused the 2026-08-05
// production outage across every notification-producing function (see
// functions/src/notifications/createNotification.ts's incident note). Every
// read below therefore happens up front, and no write is staged until the
// READ PHASE is complete.
export const recordStudyOutcome = onCall<RecordStudyOutcomeRequest>(
  { region: "us-central1" },
  async (request): Promise<RecordStudyOutcomeResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    if (caller.token.role !== "student") {
      throw new HttpsError("permission-denied", "Çalışma kuyruğu yalnızca öğrenciler içindir.");
    }

    const questionId = request.data?.questionId;
    if (typeof questionId !== "string" || questionId.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz soru kimliği.");
    }
    const outcome = request.data?.outcome;
    if (!isStudyOutcome(outcome)) {
      throw new HttpsError("invalid-argument", "Geçersiz çalışma sonucu.");
    }

    // Server time is the ONLY clock that counts — a client cannot backdate
    // a review to farm a streak or bring a due date forward.
    // Optional; a malformed value is REJECTED rather than ignored, so a
    // client bug can't silently lose its replay protection.
    const rawOperationId = request.data?.operationId;
    if (rawOperationId !== undefined && !isValidOperationId(rawOperationId)) {
      throw new HttpsError("invalid-argument", "Geçersiz işlem kimliği.");
    }
    const operationId = rawOperationId as string | undefined;

    const now = Date.now();
    // The client may suggest its zone; an invalid/spoofed value silently
    // falls back rather than failing the action (see dayKey.ts).
    const timeZone = resolveTimeZone(request.data?.timeZone);
    const dayKey = toDayKey(now, timeZone);

    const db = getFirestore();
    const questionRef = db.collection("questions").doc(questionId);
    const itemRef = studyItemRef(db, caller.uid, questionId);
    const summaryRef = studySummaryRef(db, caller.uid);
    const dayRef = studyDayRef(db, caller.uid, dayKey);

    return db.runTransaction(async (tx: Transaction) => {
      // ================= READ PHASE =================
      const questionSnap = await tx.get(questionRef);
      if (!questionSnap.exists) {
        throw new HttpsError("not-found", "Soru bulunamadı.");
      }
      const question = questionSnap.data() ?? {};

      // Class questions need a membership lookup; canReadQuestion never
      // does a surprise read of its own (see its doc comment), so it's
      // resolved here, still inside the read phase.
      let isClassMember = false;
      if (question.visibility === "class" && typeof question.classId === "string") {
        const memberSnap = await tx.get(
          db.collection("classes").doc(question.classId).collection("members").doc(caller.uid),
        );
        isClassMember = memberSnap.exists;
      }
      // The SAME authoritative helper firestore.rules mirrors — never a
      // second, parallel access model.
      if (!canReadQuestion(question, caller.uid, isClassMember)) {
        throw new HttpsError("permission-denied", "Bu soruya erişim izniniz yok.");
      }

      const [itemSnap, summarySnap, daySnap] = await Promise.all([
        tx.get(itemRef),
        tx.get(summaryRef),
        tx.get(dayRef),
      ]);

      // ================= COMPUTE (pure, no I/O) =================
      const existing = itemSnap.exists ? (itemSnap.data() ?? {}) : null;
      const isNewItem = existing === null;

      // Backend replay guard. The client's double-tap lock cannot survive a
      // callable auto-retry, two devices, or a lost response — this can.
      // Returning the ALREADY-STORED state (not a recomputed one) makes a
      // retry's response deterministic and identical to the original.
      if (operationId && existing && hasProcessedOperation(existing.recentOperationIds, operationId)) {
        const summaryData = summarySnap.exists ? (summarySnap.data() ?? {}) : {};
        const dayData = daySnap.exists ? (daySnap.data() ?? {}) : {};
        const replayGoal = num(summaryData.dailyGoal, DEFAULT_DAILY_GOAL);
        const replayReviewed = num(dayData.reviewCount);
        return {
          status: existing.status,
          intervalDays: num(existing.intervalDays),
          successfulReviews: num(existing.successfulReviews),
          nextReviewAt: num(existing.nextReviewAt),
          reviewedToday: replayReviewed,
          dailyGoal: replayGoal,
          goalCompleted: replayReviewed >= replayGoal,
          currentStreak: num(summaryData.currentStreak),
        };
      }

      const scheduled = scheduleNextReview(
        existing
          ? {
              status: existing.status,
              intervalDays: num(existing.intervalDays),
              successfulReviews: num(existing.successfulReviews),
            }
          : null,
        outcome,
        now,
      );

      const wasMastered = existing?.status === "mastered";
      const isMastered = scheduled.status === "mastered";
      const masteredDelta = (isMastered ? 1 : 0) - (wasMastered ? 1 : 0);

      const summary = summarySnap.exists ? (summarySnap.data() ?? {}) : {};
      const dailyGoal = num(summary.dailyGoal, DEFAULT_DAILY_GOAL);

      const streak = advanceStreak(
        {
          currentStreak: num(summary.currentStreak),
          longestStreak: num(summary.longestStreak),
          lastStudyDay: typeof summary.lastStudyDay === "string" ? summary.lastStudyDay : null,
        },
        dayKey,
      );

      const day = daySnap.exists ? (daySnap.data() ?? {}) : {};
      const dayReviewCount = num(day.reviewCount) + 1;
      const dayUniqueCount = num(day.uniqueQuestionCount) + (isNewItem ? 1 : 0);
      const goalCompleted = dayReviewCount >= dailyGoal;

      // reviewedToday is derived from the day document, not incremented
      // blindly on the summary — so a rollover to a new calendar day resets
      // it correctly without needing a scheduled job.
      const reviewedToday = dayReviewCount;

      const source: StudySource =
        question.visibility === "class"
          ? "class"
          : question.visibility === "private"
            ? "private"
            : "public";

      // Phase 41 — cumulative per-outcome tallies, computed here in the pure
      // COMPUTE section (never in the scheduler: these are not scheduling
      // state and must never influence status/intervalDays/nextReviewAt).
      //
      // Replay safety is structural, not a second guard: the operationId
      // branch above RETURNS before this line is ever reached, so a replayed
      // gesture cannot reach any counter arithmetic — exactly as it already
      // cannot reach the scheduler, the attemptCount bump, or the daily
      // stats. One guard protects all of them, and always will.
      const itemCounters = incrementOutcomeCounters(existing, outcome);
      const dayCounters = incrementOutcomeCounters(day, outcome);

      // ================= WRITE PHASE =================
      // Every field below is a concrete value — `undefined` is never written
      // to Firestore (it throws); optional values are normalized to null.
      tx.set(
        itemRef,
        {
          questionId,
          status: scheduled.status,
          lastOutcome: scheduled.lastOutcome,
          intervalDays: scheduled.intervalDays,
          successfulReviews: scheduled.successfulReviews,
          attemptCount: num(existing?.attemptCount) + 1,
          // Cumulative, monotonic, one per member of the closed outcome
          // union. For an item that predates Phase 41 these begin at 1 on
          // its next outcome, so their sum stays BELOW attemptCount — which
          // is precisely how a reader detects that the earlier history is
          // unavailable rather than zero (see outcomeCounters.ts).
          ...itemCounters,
          firstAddedAt: isNewItem ? now : num(existing?.firstAddedAt, now),
          lastReviewedAt: now,
          nextReviewAt: scheduled.nextReviewAt,
          source,
          sourceClassId: typeof question.classId === "string" ? question.classId : null,
          questionOwnerId: typeof question.ownerId === "string" ? question.ownerId : "",
          // Bounded replay ledger, scoped to this one item — no global
          // dedupe collection, and it disappears with the item.
          recentOperationIds: operationId
            ? appendOperationId(existing?.recentOperationIds, operationId)
            : (existing?.recentOperationIds ?? []),
          schemaVersion: STUDY_SCHEMA_VERSION,
          updatedAt: now,
        },
        { merge: true },
      );

      tx.set(
        summaryRef,
        {
          totalReviewActions: num(summary.totalReviewActions) + 1,
          totalUniqueQuestions: num(summary.totalUniqueQuestions) + (isNewItem ? 1 : 0),
          // Floored: a delta can only ever be -1/0/+1 here, but a corrupted
          // legacy value must not push the count negative.
          masteredCount: Math.max(0, num(summary.masteredCount) + masteredDelta),
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastStudyDay: streak.lastStudyDay,
          dailyGoal,
          reviewedToday,
          timeZone,
          schemaVersion: STUDY_SCHEMA_VERSION,
          updatedAt: now,
        },
        { merge: true },
      );

      tx.set(
        dayRef,
        {
          dayKey,
          reviewCount: dayReviewCount,
          uniqueQuestionCount: dayUniqueCount,
          // Phase 41 — the SAME increment helper the study item now uses,
          // replacing three lines of inline arithmetic that said exactly
          // this. Identical values, one implementation.
          ...dayCounters,
          goalCompleted,
          updatedAt: now,
        },
        { merge: true },
      );

      return {
        status: scheduled.status,
        intervalDays: scheduled.intervalDays,
        successfulReviews: scheduled.successfulReviews,
        nextReviewAt: scheduled.nextReviewAt,
        reviewedToday,
        dailyGoal,
        goalCompleted,
        currentStreak: streak.currentStreak,
      };
    });
  },
);
