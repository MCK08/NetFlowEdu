import { doc, getDoc } from "firebase/firestore";

import { db } from "@services/firebase/config";
import { toggleAnswerLike, toggleQuestionLike } from "@services/firebase/functions";

import { buildLikeId } from "./likeId";

export type LikeTargetType = "question" | "answer";

const COLLECTION_BY_TYPE: Record<LikeTargetType, string> = {
  question: "questionLikes",
  answer: "answerLikes",
};

// firestore.rules only lets a user read their *own* like doc (see
// questionLikes/{likeId} — allow read: if isOwner(resource.data.userId)),
// which is exactly what the deterministic id makes possible: a single
// getDoc, no query. A missing doc just means "not liked yet", not an
// error.
export async function getMyLikeState(
  targetType: LikeTargetType,
  targetId: string,
  uid: string,
): Promise<boolean> {
  const snapshot = await getDoc(doc(db, COLLECTION_BY_TYPE[targetType], buildLikeId(targetId, uid)));
  return snapshot.exists();
}

// `liked` is the state the caller wants to end in, for BOTH target types.
//
// Phase 91 added it for questions after proving a plain toggle inverts on
// retry: a client that re-sends after a lost response un-likes what it just
// liked, and two devices meaning "like" can settle on NOT liked. Phase 92
// reproduced the identical defect on answers — including the answer owner's
// like notification being created by the first call and deleted by the retry —
// and closed it the same way.
//
// Both callables still accept the field as optional and fall back to toggling,
// so a client build that predates this keeps working; this dispatcher always
// sends it.
export async function toggleLike(
  targetType: LikeTargetType,
  targetId: string,
  liked?: boolean,
): Promise<{ liked: boolean; likeCount: number }> {
  return targetType === "question"
    ? toggleQuestionLike(targetId, liked)
    : toggleAnswerLike(targetId, liked);
}
