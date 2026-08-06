import { ModerationState } from "./moderationStates";

// Shape of moderationSubmissions/{submissionId}.
//
// Deliberately NOT a copy of the content's eventual home. It stores the
// minimum needed to make a decision, publish once, and audit afterwards —
// no denormalized question document, no provider payloads, no scores.

export const MODERATION_SCHEMA_VERSION = 1;

export type ModeratedTargetType = "question_comment" | "answer_image";

export interface ModerationSubmissionRecord {
  submissionId: string;
  authorId: string;
  targetType: ModeratedTargetType;
  /** The question this content hangs off — carries the access model. */
  questionId: string;
  /** Denormalized ONLY for reviewer scoping (a teacher may review their own
   *  class's content and no one else's). Never used to grant the author
   *  anything. */
  classId: string | null;
  organizationId: string | null;
  /** The submitted text, retained because a reviewer has to read what they
   *  are ruling on. Retention is bounded — see the phase report. */
  text: string;
  status: ModerationState;
  /** Coarse categories. Never the matched term. */
  riskCategories: string[];
  /** Machine-readable basis for the decision, for the reviewer queue. */
  decisionReason: string;
  /** Replay guard — one gesture, one submission. */
  operationId: string;
  /** Set exactly once, when the public entity is created. Its presence IS
   *  the idempotency guarantee: a second finalization returns this instead
   *  of creating a second comment. */
  publishedEntityId: string | null;
  createdAt: number;
  updatedAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
  schemaVersion: number;
}

/** What a callable returns to the author. Contains the safe status only —
 *  no categories, no reason, no reviewer identity, no provider detail. */
export interface SubmissionResult {
  submissionId: string;
  status: "checking" | "published" | "in_review" | "not_published";
  publishedEntityId: string | null;
}

export const MAX_COMMENT_LENGTH = 500;

/** Mirrors the questionComments length limit that firestore.rules enforced
 *  when clients still wrote comments directly. Kept identical on purpose:
 *  moving the write server-side must not quietly change what is accepted. */
export function isValidCommentText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_COMMENT_LENGTH;
}
