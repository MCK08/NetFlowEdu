import {
  addDoc,
  collection,
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
  startAfter,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "@services/firebase/config";
import { Question, QuestionVisibility } from "@/types/question";

export interface CreateQuestionInput {
  ownerId: string;
  organizationId: string | null;
  imageUrl: string;
  visibility: QuestionVisibility;
}

// Matches firestore.rules `allow create` exactly: ownerId must be the
// caller's uid, organizationId must equal the caller's own claim (null for
// students without an organization — the rule compares with ==, so a
// literal null here is required, not omission), visibility must be
// 'private' or 'public' (the rule rejects 'class' — see firestore.rules'
// comment on why). Returns the new doc id so the caller can optimistically
// prepend it to the feed.
export async function createQuestion(input: CreateQuestionInput): Promise<string> {
  const ref = await addDoc(collection(db, "questions"), {
    ownerId: input.ownerId,
    organizationId: input.organizationId,
    visibility: input.visibility,
    imageUrl: input.imageUrl,
    classId: null,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
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
    likeCount: data.likeCount ?? 0,
    commentCount: data.commentCount ?? 0,
    answerCount: data.answerCount ?? 0,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
  };
}

// Returns null only when firestore.rules allowed the read but the document
// doesn't exist (e.g. deleted after being linked to). A rule DENIAL throws
// a FirebaseError with code "permission-denied" instead — Firestore's rule
// engine can't safely distinguish "never existed" from "exists but you
// can't see it" without leaking existence, so both surface that way. The
// caller (questionDetailService) maps both outcomes to Turkish messages.
export async function getQuestionById(questionId: string): Promise<Question | null> {
  const snapshot = await getDoc(doc(db, "questions", questionId));
  if (!snapshot.exists()) return null;
  return toQuestion(snapshot.id, snapshot.data());
}

export interface QuestionPage {
  questions: Question[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

function toPage(docs: QueryDocumentSnapshot<DocumentData>[], pageSize: number): QuestionPage {
  return {
    questions: docs.map((d) => toQuestion(d.id, d.data())),
    cursor: docs.length > 0 ? (docs[docs.length - 1] as QueryDocumentSnapshot<DocumentData>) : null,
    hasMore: docs.length === pageSize,
  };
}

// One page of the caller's own questions, newest first. Matches
// firestore.rules (owner can always read their own regardless of
// visibility) and the ownerId+createdAt composite index.
export async function getOwnQuestionsPage(
  uid: string,
  pageSize: number,
  cursor: DocumentSnapshot<DocumentData> | null,
): Promise<QuestionPage> {
  const constraints = [
    where("ownerId", "==", uid),
    orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(query(collection(db, "questions"), ...constraints));
  return toPage(snapshot.docs, pageSize);
}

// One page of public questions from anyone, newest first. Matches
// firestore.rules ('public' visibility is readable by any authenticated
// user) and the visibility+createdAt composite index.
export async function getPublicQuestionsPage(
  pageSize: number,
  cursor: DocumentSnapshot<DocumentData> | null,
): Promise<QuestionPage> {
  const constraints = [
    where("visibility", "==", "public"),
    orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(query(collection(db, "questions"), ...constraints));
  return toPage(snapshot.docs, pageSize);
}

// All of a single user's public questions, for their public profile grid.
// No pagination in this phase — bounded by a generous limit instead, same
// spirit as the rest of this MVP's "keep it simple" approach to lists that
// aren't the main feed.
export async function getUserPublicQuestions(ownerId: string): Promise<Question[]> {
  const q = query(
    collection(db, "questions"),
    where("ownerId", "==", ownerId),
    where("visibility", "==", "public"),
    orderBy("createdAt", "desc"),
    limit(30),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => toQuestion(d.id, d.data()));
}
