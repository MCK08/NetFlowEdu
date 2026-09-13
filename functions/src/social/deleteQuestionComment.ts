import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

// Phase 93 — the authoritative way a comment is removed.
//
// WHAT THIS CLOSES
//
// Comment CREATE has been server-only since Phase 17: the moderation callable
// is the sole writer, `allow create: if false` makes that gate unbypassable,
// and a deterministic uid_operationId submission id makes it idempotent.
// DELETE was the other half, and it was still a direct client `deleteDoc`.
// Phase 93 reproduced that before changing anything — an author's raw REST
// DELETE returned 200 — so the two ends of one lifecycle answered to two
// different authorities.
//
// WHAT IT DELIBERATELY DOES NOT CHANGE
//
// The authorization is copied from the rule it replaces, exactly: the comment's
// AUTHOR, and nobody else. The same probe confirmed that a different student,
// the question's own owner and an outsider were already refused with 403, so
// there is no right here to widen and none is widened. Owning a question does
// not make someone the moderator of the conversation under it, and teaching a
// class does not either — the boundary Phases 86 through 92 hold everywhere
// else.
//
// WHY THE COUNTER IS NOT TOUCHED HERE
//
// `questions/{id}.commentCount` is maintained by onQuestionCommentDelete, which
// fires on this deletion too — Admin SDK writes trigger Firestore events like
// any other. Decrementing here as well would double-count. The counter keeps
// exactly one side-effect owner, which is the point of not moving it.

interface DeleteCommentRequest {
  commentId?: unknown;
}

export interface DeleteCommentResult {
  /** True when this call removed the document; false when it was already gone.
   *  Both are successes — see applyDeleteQuestionComment's doc comment. */
  deleted: boolean;
}

/** The whole contract, with `db` and the caller as parameters — the shape
 *  markAllNotificationsReadForUid established and every server gateway since
 *  has used, so the test that proves authorization and retry safety drives this
 *  exact shipped code against a real emulator.
 *
 *  A comment that is already gone returns `{ deleted: false }` rather than
 *  throwing. That is what makes a retry after a lost response safe: the first
 *  call did what the user asked, so failing the second would be a lie the
 *  client would have to explain. It also cannot leak anything — the caller
 *  learns only that no comment of theirs is there, which they already knew. */
export async function applyDeleteQuestionComment(
  db: Firestore,
  callerUid: string | undefined,
  data: DeleteCommentRequest | undefined,
): Promise<DeleteCommentResult> {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  }

  const commentId = data?.commentId;
  if (typeof commentId !== "string" || commentId.length === 0 || commentId.includes("/")) {
    throw new HttpsError("invalid-argument", "Geçersiz yorum kimliği.");
  }

  const commentRef = db.collection("questionComments").doc(commentId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(commentRef);
    if (!snapshot.exists) {
      return { deleted: false };
    }

    // Authorization reads the stored document, never the payload. The client
    // sends an id and nothing else, so there is no ownerId or questionId to
    // forge — the fields simply are not accepted.
    const comment = snapshot.data() as Record<string, unknown>;
    if (comment.ownerId !== callerUid) {
      throw new HttpsError("permission-denied", "Bu yorumu yalnızca yazarı silebilir.");
    }

    // The parent question is deliberately NOT required to exist. The rule this
    // replaces did not check it either, and requiring it would strand an author
    // with a comment they can never remove if the question is ever taken down
    // server-side (the orphan case Phase 90 measured). Ownership of the comment
    // is the whole question here.
    tx.delete(commentRef);
    return { deleted: true };
  });
}

export const deleteQuestionComment = onCall<DeleteCommentRequest>(
  { region: "us-central1" },
  (request) => applyDeleteQuestionComment(getFirestore(), request.auth?.uid, request.data),
);
