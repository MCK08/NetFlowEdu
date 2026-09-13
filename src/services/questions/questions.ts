import {
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
  startAfter,
  Timestamp,
  where,
} from "firebase/firestore";
import { httpsCallable, FunctionsError } from "firebase/functions";

import { parseChoicesFromUnknown, parseCorrectChoiceFromUnknown } from "@features/questions/services/multipleChoice";
import { parseHintsFromUnknown } from "@features/questions/services/questionHints";
import { parseChoiceFeedbackFromUnknown } from "@features/questions/services/choiceFeedback";
import {
  QuestionRevisionPayload,
} from "@features/questions/services/questionRevision";
import { getCurrentUser } from "@services/firebase/auth";
import { QuestionCreateError, QuestionCreateErrorCode } from "./questionCreateError";
import { db, functions } from "@services/firebase/config";
import { ChoiceLabel, Question, QuestionChoices, QuestionPosterRole, QuestionVisibility } from "@/types/question";

// Re-exported so every existing importer of this service keeps working; the
// definitions live in a dependency-free module so Jest-testable code (the
// composer error mapper) can import them without loading firebase/config.
export { QuestionCreateError };
export type { QuestionCreateErrorCode };

export interface CreateQuestionInput {
  ownerId: string;
  organizationId: string | null;
  imageUrl: string;
  visibility: QuestionVisibility;
  // Required (and only meaningful) when visibility === "class" — see
  // firestore.rules' questions/{questionId} create rule, which checks this
  // against the target class's own teacherId/organizationId.
  classId?: string | null;
  // Who's actually posting — required so every caller states it explicitly
  // rather than a silent default. firestore.rules verifies this against the
  // caller's own classes/{classId}/members/{uid} role for class questions;
  // for private/public questions it's whatever the caller's own claims say
  // (never independently checked, same trust level as ownerId==uid()).
  posterRole: QuestionPosterRole;
  // All optional — every caller that omits them keeps writing exactly the
  // "" / null legacy shape this collection already had before Phase 21
  // (e.g. the teacher's one-tap class-question flow, which shows no
  // metadata form and never will in this phase).
  subject?: string;
  description?: string | null;
  topic?: string;
  gradeLevel?: string;
  // Callers MUST already have run these through multipleChoice.ts's
  // buildChoicesPayload — this function does not re-validate the
  // choices/correctChoice pairing itself, exactly like it doesn't
  // re-validate subject's length here either (that's the composer's job).
  choices?: QuestionChoices | null;
  correctChoice?: ChoiceLabel | null;
  // Phase 72 — optional author-written hints, gentlest first. Omitted by every
  // existing caller, which keeps writing exactly the shape it always did.
  hints?: readonly string[] | null;
  // Phase 77 — optional author-written feedback per wrong choice. Sanitized
  // against `choices`/`correctChoice` below rather than trusted, so it can
  // never name an option this question does not have.
  choiceFeedback?: Partial<Record<ChoiceLabel, unknown>> | null;
  // Phase 89 — identifies ONE submission attempt, so a retried submission
  // cannot become a second question. Supplied by the caller when it has a
  // stable notion of "this attempt"; otherwise generated per call. Never
  // derived from the question's content — two intentionally identical
  // questions are two questions.
  operationId?: string;
}

/** Creates one question through the authoritative server gateway.
 *
 *  Phase 89 — this performs NO Firestore write, and could not: the rules
 *  refuse a client create outright. It hands the draft to `createQuestion` on
 *  the server, which derives the fields an author must not choose for
 *  themselves and validates everything else.
 *
 *  WHY THE INPUT STILL CARRIES ownerId / posterRole / organizationId
 *
 *  Four composers call this and none of them needed to change. Those three
 *  fields are simply no longer SENT: the server reads the caller's own uid,
 *  their real standing in the target class, and that class's organisation. A
 *  caller passing something else does not get it — it never leaves this
 *  function. They stay on the interface because removing them would churn four
 *  call sites to delete values the server now ignores anyway.
 *
 *  `operationId` identifies ONE submission attempt so a retry cannot produce a
 *  second question. It is not derived from the question's content: two
 *  intentionally identical questions are two questions.
 *
 *  Returns the new doc id, so the caller can still optimistically prepend it. */
export async function createQuestion(input: CreateQuestionInput): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new QuestionCreateError("unauthenticated");

  const callable = httpsCallable<QuestionCreatePayload, { questionId: string; created: boolean }>(
    functions,
    "createQuestion",
  );

  try {
    const result = await callable({
      operationId: input.operationId ?? newOperationId(),
      // The create SURFACE, not a visibility the client gets to assert. The
      // server turns this into the stored visibility and classId.
      surface: input.visibility,
      classId: input.visibility === "class" ? (input.classId ?? null) : null,
      imageUrl: input.imageUrl,
      subject: input.subject ?? "",
      topic: input.topic ?? "",
      gradeLevel: input.gradeLevel ?? "",
      description: input.description ?? null,
      choices: input.choices ?? null,
      correctChoice: input.correctChoice ?? null,
      choiceFeedback: input.choiceFeedback ?? null,
      hints: input.hints ?? null,
    });
    return result.data.questionId;
  } catch (error) {
    throw new QuestionCreateError(mapCreateError(error));
  }
}

interface QuestionCreatePayload {
  operationId: string;
  surface: QuestionVisibility;
  classId: string | null;
  imageUrl: string;
  subject: string;
  topic: string;
  gradeLevel: string;
  description: string | null;
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
  choiceFeedback: Partial<Record<ChoiceLabel, unknown>> | null;
  hints: readonly string[] | null;
}

/** A random, opaque id for one submission attempt.
 *
 *  Generated here rather than on the server because the whole point is that a
 *  retry of the SAME attempt reuses it; a server-generated id would be new
 *  every call and could not deduplicate anything. */
function newOperationId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 24; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

function mapCreateError(error: unknown): QuestionCreateErrorCode {
  const code = (error as FunctionsError | undefined)?.code;
  if (code === "functions/unauthenticated") return "unauthenticated";
  if (code === "functions/permission-denied") return "not-member";
  if (code === "functions/not-found") return "class-not-found";
  if (code === "functions/invalid-argument") return "invalid-question";
  return "unavailable";
}

function toQuestion(id: string, data: DocumentData): Question {
  const choices = parseChoicesFromUnknown(data.choices);
  const correctChoice = parseCorrectChoiceFromUnknown(data.correctChoice, choices);
  return {
    id,
    ownerId: data.ownerId ?? "",
    organizationId: data.organizationId ?? null,
    visibility: data.visibility ?? "private",
    imageUrl: data.imageUrl ?? "",
    classId: data.classId ?? null,
    subject: data.subject ?? "",
    topic: typeof data.topic === "string" ? data.topic : "",
    gradeLevel: typeof data.gradeLevel === "string" ? data.gradeLevel : "",
    description: data.description ?? null,
    // Missing on any question created before Phase 9.1 — always "teacher"
    // for those, since a student could never create one until now.
    posterRole: data.posterRole === "student" ? "student" : "teacher",
    likeCount: data.likeCount ?? 0,
    commentCount: data.commentCount ?? 0,
    answerCount: data.answerCount ?? 0,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
    choices,
    correctChoice,
    hints: parseHintsFromUnknown(data.hints),
    choiceFeedback: parseChoiceFeedbackFromUnknown(data.choiceFeedback, choices, correctChoice),
  };
}

// Returns null only when firestore.rules allowed the read but the document
// doesn't exist (e.g. deleted after being linked to). A rule DENIAL throws
// a FirebaseError with code "permission-denied" instead — Firestore's rule
// engine can't safely distinguish "never existed" from "exists but you
// can't see it" without leaking existence, so both surface that way. The
// caller (questionDetailService) maps both outcomes to Turkish messages.
// Phase 86 — the ONLY question update path.
//
// WHY THIS IS NOT A GENERIC PATCH
//
// A function that accepted `Partial<Question>` and spread it into the write
// would be one careless call site away from writing ownerId, classId or a
// counter. firestore.rules would reject that write — and the failure would
// surface as a confusing permission error on an innocent-looking edit. This
// function instead takes a revision whose TYPE cannot express those fields,
// re-runs the canonical sanitisers on it, and writes an explicit list of five
// keys. There is no spread anywhere in it.
//
// WHY OWNERSHIP IS CHECKED HERE TOO
//
// The rules are the authority and would refuse a non-owner regardless. The
// service still reads the document and compares ownerId to the signed-in user
// first, so the caller gets a clear "not-owner" instead of a rejected write,
// and so a screen reached by a hand-typed route cannot even attempt one.
//
// WHAT THIS NEVER TOUCHES
//
// studyEvents, studyItems, semanticDefinitions, cohorts, evidence, timelines —
// nothing but this one question document, and nothing in it but authoring
// fields. A revision is future-facing: the next learner meets the revised
// question, and every outcome already recorded stays recorded as it was.
//
// CONCURRENCY AND ENFORCEMENT (Phase 88): the checks did not change, but where
// they run did. Phase 87 ran ownership, staleness and sanitisation inside a
// CLIENT transaction, which protected this path and nothing else — Phase 87
// proved an owner could PATCH the document directly and skip all three. So this
// function is now a thin wrapper over the `updateQuestionRevision` callable,
// and firestore.rules deny client updates to questions outright.
//
// Nothing below decides anything. The server re-derives the fingerprint from
// the document at commit time, re-runs every sanitiser, and validates any newly
// referenced shared definition. The client still sanitises for UX, never as the
// authority.
//
// Question still carries no updatedAt and no version: no field was added and
// nothing was migrated.

export type QuestionUpdateErrorCode =
  | "unauthenticated"
  | "not-found"
  | "not-owner"
  /** Phase 87 — the authoring state moved since this editor loaded it. Its own
   *  product state: not a permission problem, not a network problem, and not a
   *  validation problem, so it is never collapsed into one of those. */
  | "revision-conflict"
  /** Phase 88 — the server refused the payload itself: too few options, no
   *  correct answer, or a shared definition that is missing, out of scope or
   *  archived. Distinct from a conflict, which is about timing, not content. */
  | "invalid-revision"
  /** Phase 88 — the gateway could not be reached or failed unexpectedly. */
  | "unavailable";

/** Mirrors REVISION_CONFLICT_REASON in
 *  functions/src/questions/updateQuestionRevision.ts. Matched on rather than
 *  the message so translating the copy cannot break conflict detection. */
export const REVISION_CONFLICT_REASON = "revision-conflict";

export class QuestionUpdateError extends Error {
  constructor(public readonly code: QuestionUpdateErrorCode) {
    super(`question update refused: ${code}`);
    this.name = "QuestionUpdateError";
  }
}

/** Revises one question the signed-in user owns, through the authoritative
 *  server gateway. Returns the question as it now reads back from Firestore.
 *
 *  One callable invocation. The server performs the transaction; this client
 *  performs no question write at all, and could not: the rules refuse it.
 *
 *  `expectedRevision` is the fingerprint of the authoring state this editor
 *  loaded. The server compares it against the document at commit time and
 *  refuses a stale draft rather than letting it overwrite a newer save. */
export async function updateQuestion(
  questionId: string,
  payload: QuestionRevisionPayload,
  options?: { expectedRevision?: string },
): Promise<Question> {
  const user = getCurrentUser();
  if (!user) throw new QuestionUpdateError("unauthenticated");
  if (!options?.expectedRevision) {
    // Not a fallback to last-write-wins: without a fingerprint there is nothing
    // for the server to compare, so the call is refused here rather than
    // silently becoming an unguarded overwrite.
    throw new QuestionUpdateError("revision-conflict");
  }

  const callable = httpsCallable<
    { questionId: string; expectedRevision: string; revision: QuestionRevisionPayload },
    { revision: string }
  >(functions, "updateQuestionRevision");

  try {
    await callable({
      questionId,
      expectedRevision: options.expectedRevision,
      // Only the five authoring fields exist on this type, so there is no shape
      // in which a caller could smuggle ownerId, classId or a counter — and the
      // server reads only those five regardless.
      revision: payload,
    });
  } catch (error) {
    throw new QuestionUpdateError(mapCallableError(error));
  }

  const updated = await getDoc(doc(db, "questions", questionId));
  if (!updated.exists()) throw new QuestionUpdateError("not-found");
  return toQuestion(updated.id, updated.data());
}

/** Maps the callable's typed failure onto this service's own error model.
 *
 *  A stale draft must stay distinguishable from a refusal and from a network
 *  problem, so the conflict is matched on the marker the server puts in
 *  `details` rather than on a message a translation could change. */
function mapCallableError(error: unknown): QuestionUpdateErrorCode {
  const code = (error as FunctionsError | undefined)?.code;
  const details = (error as FunctionsError | undefined)?.details as
    | { reason?: string }
    | undefined;
  if (details?.reason === REVISION_CONFLICT_REASON) return "revision-conflict";
  if (code === "functions/unauthenticated") return "unauthenticated";
  if (code === "functions/not-found") return "not-found";
  if (code === "functions/permission-denied") return "not-owner";
  if (code === "functions/invalid-argument") return "invalid-revision";
  return "unavailable";
}

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

// One page of a single class's questions, newest first. Matches
// firestore.rules (readable by any member of the class, via
// canReadQuestionData's 'class' branch) and the classId+createdAt composite
// index.
//
// Filters by BOTH classId and visibility=='class' — not classId alone.
// Data-model-wise classId is only ever non-null for a 'class'-visibility
// question (enforced by the create rule), so the extra filter never changes
// which documents match. It's required for query *provability*: Firestore
// statically proves a LIST query's rule using only the fields the query
// itself pins. With classId alone pinned, canReadQuestionData(data)'s
// 'class' branch still depends on the unconstrained `visibility` field
// (`data.visibility == 'class' && ...`), which Firestore can't resolve —
// exactly the same class of error the read rule's own comment documents for
// getOwnQuestionsPage/`visibility`. Pinning visibility too lets Firestore
// constant-fold canReadQuestionData's other two branches to `false` (their
// guards become `'class' == 'private'` / `'class' == 'public'`, both
// provably false) without ever touching `ownerId`, leaving only
// `isClassMember(classId)` — fully resolvable from the pinned classId via
// exists(). Reproduced failing before this filter existed, and passing
// after, in tests/integration/firestore.rules.test.ts's
// "classes/{classId} and members" describe block.
export async function getClassQuestionsPage(
  classId: string,
  pageSize: number,
  cursor: DocumentSnapshot<DocumentData> | null,
): Promise<QuestionPage> {
  const constraints = [
    where("classId", "==", classId),
    where("visibility", "==", "class"),
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
