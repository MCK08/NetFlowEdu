import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

import { canReadQuestion } from "../social/questionAccess";

// Phase 108 — "Topluluk Zorluk Sinyali": was this question hard for other
// students too? Answered with ANONYMOUS AGGREGATES and nothing else.
//
// THE DOCUMENT
//
// questionStats/{questionId} holds, per question, how many DISTINCT students
// have ever recorded an outcome on it and how many of those have at least
// one "Zorlandım" outcome. Two counters, both monotonic, both about people
// (never attempts), plus the band derived from them. No uid, no name, no
// answer, no history — nothing in it can be traced back to a person, and
// nothing in it lists anyone.
//
// HOW IT IS MAINTAINED
//
// Inside recordStudyOutcome's transaction — the one place an outcome becomes
// real — using the student's OWN item as read in that same transaction:
//   * a brand-new item      → attemptedStudents + 1   (this person's first outcome)
//   * first struggle ever   → struggledStudents + 1   (previous struggledCount was 0)
// A second attempt, a second struggle, or a replayed request changes nothing:
// the replay branch returns before any write, and the transitions above are
// per-person facts that can only be crossed once. The counters are therefore
// exact distinct-student counts, not inflatable tallies.
//
// THE FLOOR
//
// Below MIN_COMMUNITY_COHORT distinct students the band is "insufficient" and
// the raw counts are NOT returned to any client — a cohort of two would let a
// student infer the other's result. Even above the floor, clients receive the
// band and the cohort size, never who.

export const MIN_COMMUNITY_COHORT = 5;

export type CommunityBand = "challenging" | "average" | "light" | "insufficient";

/** Share of the cohort with struggle evidence → band. Documented thresholds,
 *  no decimals shown anywhere: half or more of a cohort struggling is
 *  "challenging"; a quarter or more is "average"; below that, "light". */
export const CHALLENGING_SHARE = 0.5;
export const AVERAGE_SHARE = 0.25;

export interface CommunityCounts {
  attemptedStudents: number;
  struggledStudents: number;
}

export function resolveCommunityBand(counts: CommunityCounts): CommunityBand {
  if (counts.attemptedStudents < MIN_COMMUNITY_COHORT) return "insufficient";
  const share = counts.struggledStudents / counts.attemptedStudents;
  if (share >= CHALLENGING_SHARE) return "challenging";
  if (share >= AVERAGE_SHARE) return "average";
  return "light";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function questionStatsRef(db: Firestore, questionId: string): DocumentReference {
  return db.collection("questionStats").doc(questionId);
}

export interface CommunityTransition {
  /** The student's item before this outcome (null when it is their first). */
  previousItem: Record<string, unknown> | null;
  outcome: string;
}

/** The next stored counts after one student's outcome, from the counts read
 *  in the same transaction. Pure so the transitions can be pinned by tests. */
export function applyCommunityTransition(
  stored: Record<string, unknown> | null,
  transition: CommunityTransition,
): CommunityCounts & { band: CommunityBand } {
  const attempted = num(stored?.attemptedStudents) + (transition.previousItem === null ? 1 : 0);
  const previouslyStruggled = num(transition.previousItem?.struggledCount) > 0;
  const struggled =
    num(stored?.struggledStudents) +
    (transition.outcome === "struggled" && !previouslyStruggled ? 1 : 0);
  const counts = { attemptedStudents: attempted, struggledStudents: Math.min(struggled, attempted) };
  return { ...counts, band: resolveCommunityBand(counts) };
}

/** Called from recordStudyOutcome's WRITE phase with the stats document it
 *  read in its READ phase. */
export function writeCommunityStats(
  tx: Transaction,
  ref: DocumentReference,
  stored: Record<string, unknown> | null,
  transition: CommunityTransition,
  now: number,
): void {
  const next = applyCommunityTransition(stored, transition);
  tx.set(
    ref,
    {
      attemptedStudents: next.attemptedStudents,
      struggledStudents: next.struggledStudents,
      band: next.band,
      schemaVersion: 1,
      updatedAt: now,
    },
    { merge: true },
  );
}

// ── Discovery: "Toplulukta Zorlayıcı Sorular" ─────────────────────────────

/** The caller's own relation to a question, private to them. */
export type OwnRelation = "retrying" | "solved_later" | "attempted" | "not_attempted";

export interface CommunityDifficultQuestion {
  questionId: string;
  subject: string;
  topic: string;
  imageUrl: string;
  band: Exclude<CommunityBand, "insufficient">;
  /** Distinct students; only ever ≥ MIN_COMMUNITY_COHORT here. */
  cohortSize: number;
  ownRelation: OwnRelation;
}

const CANDIDATE_LIMIT = 120;
const RESULT_LIMIT = 30;

const BAND_ORDER: Record<CommunityBand, number> = { challenging: 0, average: 1, light: 2, insufficient: 3 };

function ownRelationOf(item: Record<string, unknown> | null): OwnRelation {
  if (!item) return "not_attempted";
  const struggled = num(item.struggledCount) > 0 || item.lastOutcome === "struggled";
  if (!struggled) return "attempted";
  return item.lastOutcome === "solved" ? "solved_later" : "retrying";
}

export async function listCommunityDifficultQuestionsForUser(
  db: Firestore,
  callerUid: string | undefined,
): Promise<{ questions: CommunityDifficultQuestion[] }> {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  }

  // Only cohorts above the floor are ever candidates; the query itself
  // cannot return a below-floor document.
  const statsSnap = await db
    .collection("questionStats")
    .where("attemptedStudents", ">=", MIN_COMMUNITY_COHORT)
    .orderBy("attemptedStudents", "desc")
    .limit(CANDIDATE_LIMIT)
    .get();
  if (statsSnap.empty) return { questions: [] };

  const statsById = new Map<string, Record<string, unknown>>();
  for (const doc of statsSnap.docs) statsById.set(doc.id, doc.data() ?? {});
  const ids = [...statsById.keys()];

  // Access is decided by the SAME helper recordStudyOutcome and the rules
  // mirror — a question the caller cannot read is dropped here and never
  // described, not even as a count.
  const questionSnaps = await db.getAll(...ids.map((id) => db.collection("questions").doc(id)));
  const classIds = new Set<string>();
  const questions = new Map<string, Record<string, unknown>>();
  for (const snap of questionSnaps) {
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    questions.set(snap.id, data);
    if (data.visibility === "class" && typeof data.classId === "string") classIds.add(data.classId);
  }
  const memberships = new Set<string>();
  if (classIds.size > 0) {
    const memberSnaps = await db.getAll(
      ...[...classIds].map((classId) => db.collection("classes").doc(classId).collection("members").doc(callerUid)),
    );
    for (const snap of memberSnaps) {
      if (snap.exists) memberships.add(snap.ref.parent.parent?.id ?? "");
    }
  }

  const readable = ids.filter((id) => {
    const question = questions.get(id);
    if (!question) return false;
    const isMember = typeof question.classId === "string" && memberships.has(question.classId);
    return canReadQuestion(question, callerUid, isMember);
  });
  if (readable.length === 0) return { questions: [] };

  // The caller's OWN items only — never anyone else's.
  const ownSnaps = await db.getAll(
    ...readable.map((id) => db.collection("users").doc(callerUid).collection("studyItems").doc(id)),
  );
  const ownById = new Map<string, Record<string, unknown> | null>();
  for (const snap of ownSnaps) ownById.set(snap.id, snap.exists ? (snap.data() ?? {}) : null);

  const rows: CommunityDifficultQuestion[] = [];
  for (const id of readable) {
    const stats = statsById.get(id) ?? {};
    const counts = { attemptedStudents: num(stats.attemptedStudents), struggledStudents: num(stats.struggledStudents) };
    const band = resolveCommunityBand(counts);
    if (band === "insufficient") continue;
    const question = questions.get(id) ?? {};
    rows.push({
      questionId: id,
      subject: typeof question.subject === "string" ? question.subject : "",
      topic: typeof question.topic === "string" ? question.topic : "",
      imageUrl: typeof question.imageUrl === "string" ? question.imageUrl : "",
      band,
      cohortSize: counts.attemptedStudents,
      ownRelation: ownRelationOf(ownById.get(id) ?? null),
    });
  }

  rows.sort((a, b) => {
    if (BAND_ORDER[a.band] !== BAND_ORDER[b.band]) return BAND_ORDER[a.band] - BAND_ORDER[b.band];
    if (a.cohortSize !== b.cohortSize) return b.cohortSize - a.cohortSize;
    return a.questionId.localeCompare(b.questionId);
  });
  return { questions: rows.slice(0, RESULT_LIMIT) };
}

export const listCommunityDifficultQuestions = onCall(
  { region: "us-central1" },
  (request) => listCommunityDifficultQuestionsForUser(getFirestore(), request.auth?.uid),
);
