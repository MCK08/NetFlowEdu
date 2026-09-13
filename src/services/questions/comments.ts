import {
  collection,
  DocumentData,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { httpsCallable, FunctionsError } from "firebase/functions";

import { db, functions } from "@services/firebase/config";
import { CommentDeleteError, CommentDeleteErrorCode } from "./commentDeleteError";
import { QuestionComment } from "@/types/comment";

// Phase 17: there is deliberately no createComment here any more.
//
// A comment is now published only by submitQuestionCommentForModeration
// (Admin SDK) after its text has passed the moderation decision layer, and
// firestore.rules denies client creates on questionComments outright. A
// client-side create helper would therefore always fail with
// permission-denied — leaving one in place would just be a trap for the next
// person to wire up. See src/features/social/comments/services/
// commentSubmission.ts for the replacement.

/** Removes one comment the signed-in user wrote, through the authoritative
 *  server gateway.
 *
 *  Phase 93 — this performs NO Firestore write, and could not: the rules refuse
 *  a client delete outright. The server reads the stored comment to decide who
 *  may remove it, exactly as create has done since Phase 17.
 *
 *  A comment that is already gone is a SUCCESS, not an error. That is what
 *  makes a retry after a lost response safe — the user asked for it gone, and
 *  it is gone. */
export async function deleteComment(commentId: string): Promise<void> {
  const callable = httpsCallable<{ commentId: string }, { deleted: boolean }>(
    functions,
    "deleteQuestionComment",
  );
  try {
    await callable({ commentId });
  } catch (error) {
    throw new CommentDeleteError(mapCommentDeleteError(error));
  }
}

function mapCommentDeleteError(error: unknown): CommentDeleteErrorCode {
  const code = (error as FunctionsError | undefined)?.code;
  if (code === "functions/unauthenticated") return "unauthenticated";
  if (code === "functions/permission-denied") return "not-author";
  if (code === "functions/invalid-argument") return "invalid-comment";
  return "unavailable";
}

function toComment(id: string, data: DocumentData): QuestionComment {
  return {
    id,
    questionId: data.questionId ?? "",
    ownerId: data.ownerId ?? "",
    text: data.text ?? "",
    status: data.status === "deleted" ? "deleted" : "active",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
  };
}

// Matches firestore.indexes.json's questionComments composite index
// (questionId ASC, createdAt ASC) — oldest first, as specified.
export function subscribeToQuestionComments(
  questionId: string,
  onChange: (comments: QuestionComment[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "questionComments"),
    where("questionId", "==", questionId),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((docSnap) => toComment(docSnap.id, docSnap.data())));
    },
    onError,
  );
}
