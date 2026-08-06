import {
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { auth, db, functions } from "@services/firebase/config";
import { getQuestionById } from "@services/questions/questions";
import { Question } from "@/types/question";

import { StudyOutcome, StudyStatus } from "../domain/studyTypes";
import { createOperationId } from "./gestureOperationId";

// Review sessions load 10 at a time and fetch the next page with a REAL
// Firestore cursor (startAfter) — never a client-side slice of a big array.
export const DEFAULT_QUEUE_PAGE_SIZE = 10;

export interface StudyItem {
  questionId: string;
  status: StudyStatus;
  lastOutcome: StudyOutcome;
  intervalDays: number;
  successfulReviews: number;
  attemptCount: number;
  nextReviewAt: number;
  lastReviewedAt: number;
  source: "public" | "class" | "private";
  sourceClassId: string | null;
}

export interface StudySummary {
  totalReviewActions: number;
  totalUniqueQuestions: number;
  masteredCount: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDay: string | null;
  dailyGoal: number;
  reviewedToday: number;
}

export const EMPTY_SUMMARY: StudySummary = {
  totalReviewActions: 0,
  totalUniqueQuestions: 0,
  masteredCount: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDay: null,
  dailyGoal: 10,
  reviewedToday: 0,
};

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStudyItem(id: string, data: DocumentData): StudyItem {
  return {
    questionId: id,
    status: (data.status as StudyStatus) ?? "learning",
    lastOutcome: (data.lastOutcome as StudyOutcome) ?? "again",
    intervalDays: num(data.intervalDays),
    successfulReviews: num(data.successfulReviews),
    attemptCount: num(data.attemptCount),
    nextReviewAt: num(data.nextReviewAt),
    lastReviewedAt: num(data.lastReviewedAt),
    source: data.source === "class" ? "class" : data.source === "private" ? "private" : "public",
    sourceClassId: typeof data.sourceClassId === "string" ? data.sourceClassId : null,
  };
}

export interface StudyItemPage {
  items: StudyItem[];
  // The raw Firestore document to pass as the next page's startAfter. Null
  // when the page was empty (nothing left to page from).
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

// One CURSOR-PAGINATED page of due items, soonest first.
//
// Single-field range + orderBy on the SAME field, which Firestore indexes
// automatically — deliberately no composite filter (e.g. + status), so this
// feature needs no index deployment at all. `startAfter(cursor)` is a real
// server-side cursor: the client never fetches the whole collection and
// slices it.
export async function getDueStudyItemsPage(
  uid: string,
  now: number,
  pageSize: number = DEFAULT_QUEUE_PAGE_SIZE,
  cursor: DocumentSnapshot<DocumentData> | null = null,
): Promise<StudyItemPage> {
  const constraints = [
    where("nextReviewAt", "<=", now),
    orderBy("nextReviewAt", "asc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(query(collection(db, "users", uid, "studyItems"), ...constraints));
  const docs = snapshot.docs;
  return {
    items: docs.map((d) => toStudyItem(d.id, d.data())),
    cursor: docs.length > 0 ? (docs[docs.length - 1] as QueryDocumentSnapshot<DocumentData>) : null,
    hasMore: docs.length === pageSize,
  };
}

// One-shot read of the caller's OWN study item for a single question.
//
// Returns the raw document data (or null) — parsing/normalization is the
// pure parser's job (studyItemParser.ts), so the defensive logic stays
// directly unit-testable. firestore.rules restricts this path to the owner,
// so a cross-user read is impossible regardless of what the caller asks for.
export async function fetchStudyItemRaw(
  questionId: string,
): Promise<Record<string, unknown> | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snapshot = await getDoc(doc(db, "users", uid, "studyItems", questionId));
  if (!snapshot.exists()) return null;
  return snapshot.data() as Record<string, unknown>;
}

// A single realtime listener on one small summary document — the same cheap
// pattern the unread-notification badge uses. The queue itself is a plain
// getDocs (no listener), so this feature adds exactly one listener total.
export function subscribeToStudySummary(
  uid: string,
  onChange: (summary: StudySummary) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid, "studyMeta", "summary"),
    (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        onChange(EMPTY_SUMMARY);
        return;
      }
      onChange({
        totalReviewActions: num(data.totalReviewActions),
        totalUniqueQuestions: num(data.totalUniqueQuestions),
        masteredCount: num(data.masteredCount),
        currentStreak: num(data.currentStreak),
        longestStreak: num(data.longestStreak),
        lastStudyDay: typeof data.lastStudyDay === "string" ? data.lastStudyDay : null,
        dailyGoal: num(data.dailyGoal, EMPTY_SUMMARY.dailyGoal),
        reviewedToday: num(data.reviewedToday),
      });
    },
    () => onChange(EMPTY_SUMMARY),
  );
}

export interface ResolvedQueueEntry {
  item: StudyItem;
  // null when the question was deleted, or the student lost access to it
  // (e.g. removed from the class). The queue renders these as an explicit
  // "no longer available" row rather than crashing or silently dropping
  // them — the study item itself is intentionally left alone.
  question: Question | null;
}

// Re-fetches each question through the normal, rules-enforced client read.
// This is what makes it safe for studyItems to carry no content: access is
// re-authorized by Firestore on every single queue render, so revoked
// access takes effect immediately.
export async function resolveQueueEntries(items: StudyItem[]): Promise<ResolvedQueueEntry[]> {
  return Promise.all(
    items.map(async (item) => {
      try {
        const question = await getQuestionById(item.questionId);
        return { item, question };
      } catch {
        // permission-denied (lost access) and not-found both land here and
        // both mean the same thing to the student: it's gone.
        return { item, question: null };
      }
    }),
  );
}

export interface RecordOutcomeResult {
  status: StudyStatus;
  intervalDays: number;
  successfulReviews: number;
  nextReviewAt: number;
  reviewedToday: number;
  dailyGoal: number;
  goalCompleted: boolean;
  currentStreak: number;
}

// Re-exported so callers keep one import site for the study API. The
// implementation lives in gestureOperationId.ts alongside the rules that
// decide when an id is REUSED — see that file.
export { createOperationId };

// The client never computes scheduling, day keys or streaks — it reports
// what happened and the server decides. See
// functions/src/study/recordStudyOutcome.ts.
export async function recordStudyOutcome(
  questionId: string,
  outcome: StudyOutcome,
  operationId: string = createOperationId(),
): Promise<RecordOutcomeResult> {
  const callable = httpsCallable<
    { questionId: string; outcome: StudyOutcome; timeZone: string; operationId: string },
    RecordOutcomeResult
  >(functions, "recordStudyOutcome");
  const result = await callable({
    questionId,
    outcome,
    timeZone: resolveLocalTimeZone(),
    operationId,
  });
  return result.data;
}

// Drops a question from the study plan entirely — the only way out of an
// item whose question was deleted or whose access was revoked. See
// functions/src/study/removeStudyItem.ts (idempotent; removing something
// already gone succeeds).
export async function removeStudyItem(questionId: string): Promise<{ removed: boolean }> {
  const callable = httpsCallable<{ questionId: string }, { removed: boolean }>(
    functions,
    "removeStudyItem",
  );
  const result = await callable({ questionId });
  return result.data;
}

export async function setStudyDailyGoal(dailyGoal: number): Promise<{ dailyGoal: number }> {
  const callable = httpsCallable<{ dailyGoal: number; timeZone: string }, { dailyGoal: number }>(
    functions,
    "setStudyDailyGoal",
  );
  const result = await callable({ dailyGoal, timeZone: resolveLocalTimeZone() });
  return result.data;
}

// Only ever a SUGGESTION to the server, which validates it and falls back
// on anything unrecognized (see functions/src/study/dayKey.ts).
export function resolveLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}
