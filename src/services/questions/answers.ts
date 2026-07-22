import {
  addDoc,
  collection,
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
import { Answer } from "@/types/answer";

import { buildAnswerDocument, CreateAnswerInput } from "./answerDocument";

export type { CreateAnswerInput } from "./answerDocument";
export { buildAnswerDocument } from "./answerDocument";

export async function createAnswer(input: CreateAnswerInput): Promise<void> {
  await addDoc(collection(db, "answers"), {
    ...buildAnswerDocument(input),
    createdAt: serverTimestamp(),
  });
}

function toAnswer(id: string, data: DocumentData): Answer {
  return {
    id,
    questionId: data.questionId ?? "",
    ownerId: data.ownerId ?? "",
    imageUrl: data.imageUrl ?? "",
    method: data.method === "drawing" ? "drawing" : "photo",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
  };
}

// Matches firestore.indexes.json's answers composite index
// (questionId ASC, createdAt ASC) exactly — this exact filter+orderBy
// combination is what that index exists for.
export function subscribeToAnswersForQuestion(
  questionId: string,
  onChange: (answers: Answer[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "answers"),
    where("questionId", "==", questionId),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((docSnap) => toAnswer(docSnap.id, docSnap.data())));
    },
    onError,
  );
}
