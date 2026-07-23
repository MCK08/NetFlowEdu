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

export async function toggleLike(
  targetType: LikeTargetType,
  targetId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  return targetType === "question" ? toggleQuestionLike(targetId) : toggleAnswerLike(targetId);
}
