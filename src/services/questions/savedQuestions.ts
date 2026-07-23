import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
} from "firebase/firestore";

import { db } from "@services/firebase/config";
import { Question } from "@/types/question";

import { QuestionPage } from "./questions";

// users/{uid}/savedQuestions/{questionId} — owner-only subcollection (see
// firestore.rules), fully client-writable since it's a personal bookmark
// list with no shared counter to protect (unlike likes). Stores a
// denormalized snapshot of the question at save time (same reasoning as
// publicProfiles mirroring users) so listing saved questions never needs
// an extra read per item.
export async function saveQuestion(uid: string, question: Question): Promise<void> {
  await setDoc(doc(db, "users", uid, "savedQuestions", question.id), {
    ownerId: question.ownerId,
    organizationId: question.organizationId,
    visibility: question.visibility,
    imageUrl: question.imageUrl,
    classId: question.classId,
    likeCount: question.likeCount,
    commentCount: question.commentCount,
    answerCount: question.answerCount,
    createdAt: question.createdAt,
    savedAt: serverTimestamp(),
  });
}

export async function unsaveQuestion(uid: string, questionId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "savedQuestions", questionId));
}

export async function isQuestionSaved(uid: string, questionId: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, "users", uid, "savedQuestions", questionId));
  return snapshot.exists();
}

function toQuestion(id: string, data: DocumentData): Question {
  return {
    id,
    ownerId: data.ownerId ?? "",
    organizationId: data.organizationId ?? null,
    visibility: data.visibility ?? "private",
    imageUrl: data.imageUrl ?? "",
    classId: data.classId ?? null,
    likeCount: data.likeCount ?? 0,
    commentCount: data.commentCount ?? 0,
    answerCount: data.answerCount ?? 0,
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : data.createdAt instanceof Timestamp
          ? data.createdAt.toMillis()
          : 0,
  };
}

// One page of the caller's saved questions, most-recently-saved first.
// Single-field orderBy — no composite index needed (Firestore indexes
// every field singly by default).
export async function getSavedQuestionsPage(
  uid: string,
  pageSize: number,
  cursor: DocumentSnapshot<DocumentData> | null,
): Promise<QuestionPage> {
  const constraints = [
    orderBy("savedAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(
    query(collection(db, "users", uid, "savedQuestions"), ...constraints),
  );
  return {
    questions: snapshot.docs.map((d) => toQuestion(d.id, d.data())),
    cursor: snapshot.docs.length > 0 ? (snapshot.docs[snapshot.docs.length - 1] as QueryDocumentSnapshot<DocumentData>) : null,
    hasMore: snapshot.docs.length === pageSize,
  };
}
