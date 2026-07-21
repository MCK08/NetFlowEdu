import {
  addDoc,
  collection,
  DocumentData,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "@services/firebase/config";
import { Question } from "@/types/question";

export interface CreateQuestionInput {
  ownerId: string;
  organizationId: string | null;
  imageUrl: string;
}

// Matches firestore.rules `allow create` exactly: ownerId must be the
// caller's uid, organizationId must equal the caller's own claim (null for
// students without an organization — the rule compares with ==, so a
// literal null here is required, not omission). Returns the new doc id so
// the caller can optimistically prepend it to the feed.
export async function createQuestion(input: CreateQuestionInput): Promise<string> {
  const ref = await addDoc(collection(db, "questions"), {
    ownerId: input.ownerId,
    organizationId: input.organizationId,
    visibility: "private",
    imageUrl: input.imageUrl,
    classId: null,
    likes: 0,
    comments: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

function toQuestion(id: string, data: DocumentData): Question {
  return {
    id,
    ownerId: data.ownerId ?? "",
    organizationId: data.organizationId ?? null,
    visibility: data.visibility ?? "private",
    imageUrl: data.imageUrl ?? "",
    classId: data.classId ?? null,
    likes: data.likes ?? 0,
    comments: data.comments ?? 0,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
  };
}

// firestore.rules only lets a private question be read by its owner, and a
// bare `orderBy(createdAt)` query across the whole collection can't be
// proven safe for every other user's private docs, so this always scopes
// to the caller's own uploads via `where("ownerId", "==", uid)`. That's the
// full "feed" this MVP phase verifies: upload -> storage -> read-back.
export async function getOwnQuestions(uid: string): Promise<Question[]> {
  const q = query(
    collection(db, "questions"),
    where("ownerId", "==", uid),
    orderBy("createdAt", "desc"),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => toQuestion(doc.id, doc.data()));
}
