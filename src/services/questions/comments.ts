import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { db } from "@services/firebase/config";
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

export async function deleteComment(commentId: string): Promise<void> {
  await deleteDoc(doc(db, "questionComments", commentId));
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
