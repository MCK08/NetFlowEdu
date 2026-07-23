import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { db } from "@services/firebase/config";
import { QuestionComment } from "@/types/comment";

export interface CreateCommentInput {
  questionId: string;
  ownerId: string;
  text: string;
}

// Matches firestore.rules `questionComments/{commentId}` create rule
// exactly: ownerId == caller, status == 'active', createdAt == server
// time, text already trimmed/length-checked by validateCommentText before
// this is ever called.
export async function createComment(input: CreateCommentInput): Promise<void> {
  await addDoc(collection(db, "questionComments"), {
    questionId: input.questionId,
    ownerId: input.ownerId,
    text: input.text,
    status: "active",
    createdAt: serverTimestamp(),
  });
}

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
