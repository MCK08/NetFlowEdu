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

import { db } from "@services/firebase/config";
import { Answer } from "@/types/answer";

// Phase 17B: there is deliberately no createAnswer here any more.
//
// An answer is published only by submitAnswerForModeration (Admin SDK) once
// Vision SafeSearch has cleared the image and its OCR text has cleared the
// Turkish deterministic layer. firestore.rules denies client creates on
// answers outright, so a client-side helper would always fail — leaving one
// would just be a trap for the next person to wire up.

function toAnswer(id: string, data: DocumentData): Answer {
  return {
    id,
    questionId: data.questionId ?? "",
    ownerId: data.ownerId ?? "",
    imageUrl: data.imageUrl ?? "",
    method: data.method === "drawing" ? "drawing" : "photo",
    likeCount: data.likeCount ?? 0,
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
