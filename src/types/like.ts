export type LikeTargetType = "question" | "answer";

// Mirrors questionLikes/{questionId_userId} and answerLikes/{answerId_userId}
// — doc id is `${targetId}_${userId}` (see functions/src/social/likeId.ts),
// which is what makes "does this user like this target" a single get() and
// "create/delete idempotently" trivial (deterministic id, no query needed).
export interface LikeRecord {
  userId: string;
  targetId: string;
  createdAt: number;
}
