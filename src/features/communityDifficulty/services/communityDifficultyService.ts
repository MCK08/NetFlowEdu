import { FirebaseError } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@services/firebase/config";

import {
  CommunityBand,
  CommunitySignal,
  isCommunityBand,
  isOwnRelation,
  OwnRelation,
} from "./communityBand";

// Phase 108 — the two reads the community signal is allowed to make.
//
// 1. One document get for the question the student is looking at
//    (questionStats/{questionId}); firestore.rules gate it on the same
//    access the question has and forbid every list and every write.
// 2. One callable for the discovery list; the server filters by the
//    caller's access and returns bands and cohort sizes, never people.
//
// Neither path can reach another student's study data, by rule or by code.

/** Reads the signal for one question. A missing document, a question the
 *  student cannot read, or a below-floor cohort all resolve to
 *  "insufficient" — the same answer, so nothing is learnt from the
 *  difference. */
export async function getCommunitySignal(questionId: string): Promise<CommunitySignal> {
  try {
    const snapshot = await getDoc(doc(db, "questionStats", questionId));
    const data = snapshot.data();
    const band = data?.band;
    if (!snapshot.exists() || !isCommunityBand(band) || band === "insufficient") {
      return { band: "insufficient", cohortSize: null };
    }
    const cohort = data?.attemptedStudents;
    return { band, cohortSize: typeof cohort === "number" && Number.isFinite(cohort) ? cohort : null };
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "permission-denied") {
      return { band: "insufficient", cohortSize: null };
    }
    throw error;
  }
}

export interface CommunityDifficultQuestion {
  questionId: string;
  subject: string;
  topic: string;
  imageUrl: string;
  band: Exclude<CommunityBand, "insufficient">;
  cohortSize: number;
  ownRelation: OwnRelation;
}

interface ListResponse {
  questions?: unknown;
}

function toRow(value: unknown): CommunityDifficultQuestion | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.questionId !== "string" || !row.questionId) return null;
  if (!isCommunityBand(row.band) || row.band === "insufficient") return null;
  if (!isOwnRelation(row.ownRelation)) return null;
  const cohortSize = typeof row.cohortSize === "number" && Number.isFinite(row.cohortSize) ? row.cohortSize : 0;
  return {
    questionId: row.questionId,
    subject: typeof row.subject === "string" ? row.subject : "",
    topic: typeof row.topic === "string" ? row.topic : "",
    imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : "",
    band: row.band,
    cohortSize,
    ownRelation: row.ownRelation,
  };
}

// See functions/src/study/communityDifficulty.ts.
export async function listCommunityDifficultQuestions(): Promise<CommunityDifficultQuestion[]> {
  const callable = httpsCallable<Record<string, never>, ListResponse>(functions, "listCommunityDifficultQuestions");
  const result = await callable({} as Record<string, never>);
  const raw = Array.isArray(result.data?.questions) ? result.data.questions : [];
  return raw.map(toRow).filter((row): row is CommunityDifficultQuestion => row !== null);
}
