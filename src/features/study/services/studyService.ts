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
import { Question } from "@/types/question";

import { StudyOutcome, StudyStatus } from "../domain/studyTypes";
import { createOperationId } from "./gestureOperationId";
import { resolveQuestionMetadata } from "./studyMetadataCache";
import { RECENT_STUDY_DAYS_WINDOW } from "./studyWeek";

// Review sessions load 10 at a time and fetch the next page with a REAL
// Firestore cursor (startAfter) — never a client-side slice of a big array.
export const DEFAULT_QUEUE_PAGE_SIZE = 10;

export interface StudyItem {
  questionId: string;
  status: StudyStatus;
  lastOutcome: StudyOutcome;
  intervalDays: number;
  // SCHEDULER STATE. Decremented by "struggled", reset by "again" — never a
  // cumulative success tally. See outcomeCounters.ts for why that
  // distinction matters and what to use instead.
  successfulReviews: number;
  attemptCount: number;
  nextReviewAt: number;
  lastReviewedAt: number;
  source: "public" | "class" | "private";
  sourceClassId: string | null;
  // Phase 41 — cumulative per-outcome counters, null on any document
  // written before they existed. Optional on the TYPE so existing
  // fixtures/tests that build a StudyItem by hand keep compiling; always
  // set (to a number or an explicit null) by toStudyItem below.
  solvedCount?: number | null;
  struggledCount?: number | null;
  againCount?: number | null;
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

// Absent counter -> null, NOT 0. A pre-Phase-41 document genuinely has no
// cumulative history, and zero would be a false claim about it rather than
// an admission of not knowing (see outcomeCounters.ts).
function counterOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
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
    solvedCount: counterOrNull(data.solvedCount),
    struggledCount: counterOrNull(data.struggledCount),
    againCount: counterOrNull(data.againCount),
  };
}

export interface StudyItemPage {
  items: StudyItem[];
  // The raw Firestore document to pass as the next page's startAfter. Null
  // when the page was empty (nothing left to page from).
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

// Phase 22 — every study item for the caller, unordered, for the Learning
// Hub's subject/topic breakdown. Deliberately a SEPARATE query from
// getDueStudyItemsPage below rather than a variant of it: that one is
// intentionally narrow (due-only, cursor-paginated, small pages) for the
// review queue's working set, and reusing it here would mean either losing
// the due filter (defeating its purpose there) or threading a new
// "unfiltered" mode through code that has no other reason to support one.
//
// No `where` clause, so this needs no COMPOSITE index — but it does
// orderBy nextReviewAt, which is a single-field range/sort Firestore
// indexes automatically (the exact same field getDueStudyItemsPage already
// orders by), so this still deploys nothing new. The ordering matters
// specifically because of MAX_ALL_STUDY_ITEMS below: bounded by a defensive
// ceiling, not a real pagination scheme (a single student's studyItems
// subcollection is expected to stay well under this for the foreseeable
// future) — but IF that ceiling is ever hit, ordering by nextReviewAt means
// the items kept are the ones soonest due, i.e. the most relevant ones for
// "what needs attention", rather than an arbitrary Firestore-decided subset
// that could just as easily drop exactly the due items the Hub most needs.
export const MAX_ALL_STUDY_ITEMS = 500;

export async function getAllStudyItems(uid: string): Promise<StudyItem[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "users", uid, "studyItems"),
      orderBy("nextReviewAt", "asc"),
      limit(MAX_ALL_STUDY_ITEMS),
    ),
  );
  return snapshot.docs.map((d) => toStudyItem(d.id, d.data()));
}

// Phase 27 — the Teacher Class Performance dashboard's one and only new
// query. A SINGLE-FIELD equality filter (`sourceClassId`), no `orderBy`
// combined with it, so this needs no composite index — and it's exactly
// what firestore.rules' updated studyItems rule can PROVE: the query's own
// `where` pins `sourceClassId`, so the rule can resolve
// `resource.data.sourceClassId` for every candidate document without
// touching any other field. `sourceClassId` is written by
// recordStudyOutcome itself (Admin SDK) — non-null only for an item
// studied from a real class question — so this can never surface a
// student's private/public study activity, only what happened in this one
// classroom, and only to that class's own teacher.
//
// No `limit`: a class's own question pool is what bounds this (nowhere
// near MAX_ALL_STUDY_ITEMS in practice), not an arbitrary ceiling — and
// unlike getAllStudyItems this is per-CLASS, not per-STUDENT's entire
// history, so it stays small by construction.
export async function getClassSourcedStudyItems(
  studentUid: string,
  classId: string,
): Promise<StudyItem[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "users", studentUid, "studyItems"),
      where("sourceClassId", "==", classId),
    ),
  );
  return snapshot.docs.map((d) => toStudyItem(d.id, d.data()));
}

// Phase 25 — one calendar day's real review counters, exactly as written by
// recordStudyOutcome's transaction (see functions/src/study/
// recordStudyOutcome.ts's `studyDayRef` write) — reviewCount/solvedCount/
// struggledCount are genuine server-computed numbers, never estimated here.
export interface StudyDay {
  // "YYYY-MM-DD" in the student's own timezone at the time it was recorded
  // (see functions/src/study/dayKey.ts) — the document id itself, which is
  // also what makes it lexicographically sortable without a stored field.
  dayKey: string;
  reviewCount: number;
  solvedCount: number;
  struggledCount: number;
}

function toStudyDay(id: string, data: DocumentData): StudyDay {
  return {
    dayKey: id,
    reviewCount: num(data.reviewCount),
    solvedCount: num(data.solvedCount),
    struggledCount: num(data.struggledCount),
  };
}

// How many recent calendar days the trend engine looks at. Not a magic
// percentage — a fixed, small window chosen so buildLearningTrend always has
// enough real days to split into a "recent half" vs an "earlier half" (see
// learningTrend.ts) while staying a single cheap, uncapped-by-cursor read.
// Re-exported (not redefined) from the pure studyWeek.ts — see its own doc
// comment for why the constant lives there. Every existing importer of
// RECENT_STUDY_DAYS_WINDOW from this module keeps working unchanged.
export { RECENT_STUDY_DAYS_WINDOW };

// users/{uid}/studyDays/{dayKey} — firestore.rules already allows
// `isOwner(uid)` to read this (no rule change needed; it simply had no
// client reader before this phase).
//
// Orders by the `dayKey` FIELD (also written verbatim onto the document by
// recordStudyOutcome's transaction — see functions/src/study/
// recordStudyOutcome.ts's `dayKey,` write), NOT documentId() even though
// the two hold the same value: `orderBy(documentId(), "desc")` (and even
// the ascending + limitToLast workaround, which the SDK implements via an
// internal descending scan anyway) are BOTH rejected outright by the
// Firestore JS SDK — "Firestore does not support descending key scans" —
// reproduced against the real rules emulator before this settled on the
// field-based query, not just assumed. A normal indexed field has no such
// restriction: single-field orderBy+limit, the exact same shape
// getAllStudyItems/getDueStudyItemsPage already use for `nextReviewAt`, so
// this needs no composite index either.
export async function getRecentStudyDays(
  uid: string,
  limitCount: number = RECENT_STUDY_DAYS_WINDOW,
): Promise<StudyDay[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "users", uid, "studyDays"),
      orderBy("dayKey", "desc"),
      limit(limitCount),
    ),
  );
  return snapshot.docs.map((d) => toStudyDay(d.id, d.data()));
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
//
// Routed through the SAME shared cache the Learning Hub's insight builder
// uses (studyMetadataCache), not a bare getQuestionById — a due item the
// queue resolves here is very often the SAME question the Hub already
// fetched metadata for in this session (or is about to), and before this
// the two paths fetched it twice with no cache between them. permission-
// denied (lost access) and not-found both still resolve to `null` — that
// mapping now lives in the cache module itself, one layer down, but the
// behavior at this call site is unchanged.
export async function resolveQueueEntries(items: StudyItem[]): Promise<ResolvedQueueEntry[]> {
  const metadata = await resolveQuestionMetadata(items.map((item) => item.questionId));
  return items.map((item) => ({ item, question: metadata.get(item.questionId) ?? null }));
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
