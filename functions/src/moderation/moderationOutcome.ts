import type { Firestore, Transaction } from "firebase-admin/firestore";

import {
  commitNotification,
  NotificationPlan,
  prepareNotification,
} from "../notifications/createNotification";
import { NotificationType } from "../notifications/notificationTypes";
import { ModeratedTargetType } from "./submissionTypes";

// Phase 99 — THE ONE PLACE a student learns what happened to content a human
// reviewed.
//
// WHY IT EXISTS
//
// Phase 97 and 98 gave manual review a resolver; they did not give the author
// an ending. The submit-time toast says "Onaylandığında yayınlanacak" and is
// dismissed immediately, and the only notification either publication path
// produces (question_answered / question_commented) is addressed to the
// QUESTION OWNER — a different person, for a different reason, and suppressed
// entirely when the author is that owner. So an approved answer arrived
// silently and a rejected one vanished without a word. This helper closes
// exactly that gap and nothing more.
//
// WHAT IT IS NOT
//
// Not a second notification system: it is a thin, read/write-split wrapper
// over createNotification.ts, which stays the only writer of a notification
// document. Not a counter owner, not a publication event — onAnswerCreate and
// onQuestionCommentCreate keep both of those jobs untouched.
//
// TWO NOTIFICATIONS, TWO PURPOSES
//
// A published answer can legitimately produce two documents: one telling the
// question's owner that an answer arrived, one telling the author that their
// submission was published. Different recipients, different actors, different
// types. They are only ever the "same" user when the author answered their own
// question — and in that case the publication notification is already
// suppressed by createNotification's self-actor guard, so the author still
// receives exactly one thing: this one.
//
// REVIEWER PRIVACY
//
// The reviewing teacher is never the actor and never appears in the document.
// A student is told the outcome of their submission, not who decided it —
// `reviewedBy` stays internal to moderationSubmissions. The actor is the
// platform itself, which is also what keeps the self-actor guard in
// prepareNotification from silently dropping a notification whose recipient is
// the person the event is about.

/** The platform as actor. Not a Firebase uid — no account can collide with it,
 *  so the self-actor guard can never suppress an outcome, and no real person is
 *  attributed a moderation decision. */
export const MODERATION_ACTOR_ID = "system";

/** Rendered by Avatar's initials fallback; the row's icon badge carries the
 *  meaning. Deliberately the product name and never a teacher's. */
export const MODERATION_ACTOR_DISPLAY_NAME = "NetFlowEdu";

export type ModerationOutcome = "approved" | "rejected";

/**
 * The notification type for one (content kind, outcome) pair.
 *
 * Four explicit types rather than one generic "moderation_outcome" with a
 * payload: the client's presentation and navigation switches are exhaustive
 * over this union, so each case is forced to state its own copy and its own
 * destination at compile time. A generic type would have moved that decision
 * into untyped data.
 */
export function moderationOutcomeType(
  targetType: ModeratedTargetType,
  outcome: ModerationOutcome,
): NotificationType | null {
  if (targetType === "answer_image") {
    return outcome === "approved" ? "answer_review_approved" : "answer_review_rejected";
  }
  if (targetType === "question_comment") {
    return outcome === "approved" ? "comment_review_approved" : "comment_review_rejected";
  }
  // A target type with no author-facing outcome yet: say nothing rather than
  // guess a message about content this helper does not understand.
  return null;
}

export interface ModerationOutcomeParams {
  /** The submission's author, read from the submission document by the
   *  caller — never from the request, and never chosen by the reviewer. */
  authorId: string;
  /** moderationSubmissions/{id}: immutable, one per submission, which is what
   *  makes "exactly one outcome per submission" a property of the document id
   *  rather than of the calling code. */
  submissionId: string;
  /** The parent question — the only navigation target an outcome ever has.
   *  A rejection has no published document to open. */
  questionId: string;
  targetType: ModeratedTargetType;
  outcome: ModerationOutcome;
}

/**
 * READ PHASE. Call inside the review transaction, before any write, exactly
 * like every other notification producer in this codebase (see the
 * production-incident note in createNotification.ts).
 *
 * Returns null when there is nothing to do — an unsupported target type, or an
 * outcome notification that already exists because this decision is being
 * retried. The dedupe key is
 * `{authorId}_{type}_system_{submissionId}`, so a retry, a concurrent second
 * session, and a re-delivered call all resolve to the same document.
 */
export async function prepareModerationOutcome(
  tx: Transaction,
  db: Firestore,
  params: ModerationOutcomeParams,
): Promise<NotificationPlan | null> {
  const type = moderationOutcomeType(params.targetType, params.outcome);
  if (!type) return null;
  return prepareNotification(tx, db, {
    recipientId: params.authorId,
    actorId: MODERATION_ACTOR_ID,
    // Supplied rather than read: there is no users/system document, and a
    // lookup that always misses is a read per decision for nothing.
    actorSnapshot: {
      displayName: MODERATION_ACTOR_DISPLAY_NAME,
      username: null,
      photoURL: null,
    },
    type,
    entityType: "moderation",
    entityId: params.submissionId,
    parentEntityId: params.questionId,
  });
}

/** WRITE PHASE. A null plan is a no-op. */
export function commitModerationOutcome(tx: Transaction, plan: NotificationPlan | null): void {
  commitNotification(tx, plan);
}
