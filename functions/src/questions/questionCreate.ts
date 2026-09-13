// Phase 89 — the pure, Node-safe half of the question CREATE contract.
//
// WHY THIS SITS BESIDE questionRevision.ts RATHER THAN DUPLICATING IT
//
// Phase 88 already moved the five-field authoring contract (description,
// choices, correctChoice, choiceFeedback, hints) to the server. Create needs
// exactly that, plus the fields a revision may never change: the scope
// metadata, the image reference, and the identity the server derives. So this
// module IMPORTS the Phase 88 contract and adds only what is create-specific.
// There is one authoring sanitiser on the server, not two.
//
// WHAT THE AUDIT FOUND, AND WHY THIS FILE VALIDATES WHAT IT VALIDATES
//
// The Phase 89 audit probed the live create rule with real tokens rather than
// reading it and guessing. Firestore rules ALREADY enforce identity: ownerId
// must equal the caller, posterRole is checked against the caller's real class
// membership, the three counters must be zero, and an outsider is refused. None
// of that was forgeable, and Phase 89 does not claim to have fixed it.
//
// What WAS forgeable, proven by that probe, is everything about the question's
// CONTENT: a createdAt in the year 2099, a correctChoice naming an option the
// question does not have, a single-option "multiple choice", a 1000-character
// hint, an imageUrl pointing at an external host, arbitrary extra fields, and —
// worst for a semantic product — a mapping to a definition that is archived,
// belongs to another class, sits in another subject/topic, or does not exist at
// all, carrying any label the client felt like sending.
//
// That is the gap this file closes.

import { createHash } from "node:crypto";

import {
  CHOICE_LABELS,
  QuestionAuthoringState,
  sanitizeQuestionAuthoringState,
} from "./questionRevision";

// ---------------------------------------------------------------------------
// Taxonomy — mirrored from the client's single source of truth.
// ---------------------------------------------------------------------------

/** Mirrors CLASS_QUESTION_SUBJECTS in src/features/classes/services/subjects.ts,
 *  which src/features/questions/data/questionTaxonomy.ts re-exports as
 *  QUESTION_SUBJECTS. Held in place by questionCreateEquivalence.test.ts. */
export const QUESTION_SUBJECTS = [
  "Matematik", "Fizik", "Kimya", "Biyoloji", "Türkçe", "Tarih", "Coğrafya", "İngilizce", "Diğer",
] as const;

/** Mirrors GRADE_LEVELS in questionTaxonomy.ts. */
export const GRADE_LEVELS = ["5", "6", "7", "8", "9", "10", "11", "12", "Diğer"] as const;

/** Mirrors TOPICS_BY_SUBJECT in questionTaxonomy.ts. */
const TOPICS_BY_SUBJECT: Record<string, readonly string[]> = {
  Matematik: ["Sayılar", "Cebir", "Denklemler", "Fonksiyonlar", "Geometri", "Olasılık", "Diğer"],
  Fizik: ["Mekanik", "Elektrik", "Optik", "Enerji", "Dalgalar", "Diğer"],
  Kimya: ["Atom ve Periyodik Sistem", "Kimyasal Bağlar", "Karışımlar", "Asit-Baz", "Diğer"],
  Biyoloji: ["Hücre", "Genetik", "Ekosistem", "İnsan Fizyolojisi", "Diğer"],
  Türkçe: ["Dil Bilgisi", "Anlam Bilgisi", "Paragraf", "Yazım Kuralları", "Diğer"],
  Tarih: ["Osmanlı Tarihi", "Cumhuriyet Tarihi", "Dünya Tarihi", "Diğer"],
  Coğrafya: ["Fiziki Coğrafya", "Beşeri Coğrafya", "Türkiye Coğrafyası", "Diğer"],
  İngilizce: ["Grammar", "Vocabulary", "Reading", "Diğer"],
};

const FALLBACK_TOPICS: readonly string[] = ["Diğer"];

/** Mirrors getTopicsForSubject: never empty, so the topic step always has an
 *  option even for a subject with no curated list. */
export function topicsForSubject(subject: string): readonly string[] {
  return TOPICS_BY_SUBJECT[subject] ?? FALLBACK_TOPICS;
}

export type QuestionVisibility = "class" | "private" | "public";
export type QuestionPosterRole = "teacher" | "student";

// ---------------------------------------------------------------------------
// Scope metadata.
// ---------------------------------------------------------------------------

/** The scope a question is filed under.
 *
 *  EMPTY IS LEGAL, AND THAT IS NOT AN OVERSIGHT. The teacher's one-tap class
 *  capture (useClassUpload → TeacherClassDetailScreen) creates an image-only
 *  question with no metadata form at all, and has since Phase 21; it writes
 *  "" for all three. Requiring a taxonomy value here would delete a live
 *  product path. So: absent or empty passes through as "", and anything
 *  non-empty must be a real taxonomy value — strictly stronger than the rule
 *  it replaces, which accepted any string up to 40 characters. */
export interface QuestionScope {
  subject: string;
  topic: string;
  gradeLevel: string;
}

export function sanitizeQuestionScope(raw: {
  subject?: unknown;
  topic?: unknown;
  gradeLevel?: unknown;
}): QuestionScope | null {
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  const topic = typeof raw.topic === "string" ? raw.topic.trim() : "";
  const gradeLevel = typeof raw.gradeLevel === "string" ? raw.gradeLevel.trim() : "";

  if (subject.length > 0 && !(QUESTION_SUBJECTS as readonly string[]).includes(subject)) return null;
  if (gradeLevel.length > 0 && !(GRADE_LEVELS as readonly string[]).includes(gradeLevel)) return null;
  // A topic only means something relative to a subject, so it is checked
  // against that subject's own list — never against a flattened global list
  // that would let "Mekanik" pass on a Türkçe question.
  if (topic.length > 0) {
    if (subject.length === 0) return null;
    if (!topicsForSubject(subject).includes(topic)) return null;
  }
  return { subject, topic, gradeLevel };
}

// ---------------------------------------------------------------------------
// Image reference.
// ---------------------------------------------------------------------------

/** The object path inside a Firebase Storage download URL, or null.
 *
 *  Only the PATH is read, never the host: the emulator serves
 *  127.0.0.1:9199 and production serves firebasestorage.googleapis.com, and a
 *  host check would either break local QA or have to whitelist it — which is
 *  worse than not checking a host at all. The path is the part that carries
 *  the security meaning, because storage.rules pins the uploader's uid into
 *  it. */
export function storageObjectPath(url: unknown): string | null {
  if (typeof url !== "string" || url.length === 0 || url.length > 2000) return null;
  const marker = "/o/";
  const start = url.indexOf(marker);
  if (start < 0) return null;
  const rest = url.slice(start + marker.length);
  const end = rest.indexOf("?");
  const encoded = end >= 0 ? rest.slice(0, end) : rest;
  if (encoded.length === 0) return null;
  try {
    const path = decodeURIComponent(encoded);
    return path.includes("..") ? null : path;
  } catch {
    return null;
  }
}

/** Whether an uploaded image genuinely belongs to this author and this surface.
 *
 *  storage.rules already refuse a write whose {ownerId} path segment is not the
 *  caller's uid, so a path carrying the caller's uid is proof the caller
 *  uploaded it. Checking the same shape here is what stops a create from
 *  pointing at somebody else's upload, or at an external host entirely — both
 *  of which the audit proved were accepted before this phase. */
export function isOwnedQuestionImagePath(
  path: string | null,
  uid: string,
  visibility: QuestionVisibility,
  classId: string | null,
): boolean {
  if (!path) return false;
  const parts = path.split("/");
  if (parts.some((segment) => segment.length === 0)) return false;
  if (parts[0] !== "questions") return false;

  if (visibility === "class") {
    // questions/class/{organizationId}/{classId}/{uid}/{fileName}
    return (
      parts.length === 6 &&
      parts[1] === "class" &&
      Boolean(classId) &&
      parts[3] === classId &&
      parts[4] === uid
    );
  }
  // questions/{public|private}/{uid}/{fileName}
  return parts.length === 4 && parts[1] === visibility && parts[2] === uid;
}

// ---------------------------------------------------------------------------
// Idempotency.
// ---------------------------------------------------------------------------

export const MIN_OPERATION_ID_LENGTH = 16;
export const MAX_OPERATION_ID_LENGTH = 64;

/** One explicit author submission. NOT a question identity.
 *
 *  Two intentionally identical questions submitted twice carry two different
 *  operation ids and both get created — that is a real thing a teacher does
 *  when building a set. The same submission retried after a dropped response
 *  carries the SAME id and must land once. This is why identity is never
 *  derived from question content: content is not intent. */
export function isValidOperationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= MIN_OPERATION_ID_LENGTH &&
    value.length <= MAX_OPERATION_ID_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/** The document id one submission will always resolve to.
 *
 *  Derived from the AUTHENTICATED uid as well as the operation id, which is
 *  what makes the key safe to accept from a client: two users who somehow send
 *  the same operation id land on two different documents, so one can never
 *  collide with, resume, or observe the other's create. The uid is not
 *  recoverable from the digest, and nothing about this id is shown in the UI.
 *
 *  Storing the key in the document id rather than in a field is deliberate: it
 *  needs no new collection, no new Question field, no index, and no cleanup
 *  job, and the absence check is the same read the transaction already does. */
export function createdQuestionId(uid: string, operationId: string): string {
  return createHash("sha256").update(`${uid}:${operationId}`).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// The canonical draft.
// ---------------------------------------------------------------------------

export interface QuestionCreateDraft {
  scope: QuestionScope;
  authoring: QuestionAuthoringState;
  /** The download URL as given, and as it will be stored. Every reader renders
   *  Question.imageUrl directly as an image source, so this must stay the URL —
   *  the extracted path below is used to PROVE ownership, never to replace it. */
  imageUrl: string;
  /** The Storage object path the URL points at, already proven to belong to
   *  this author and this surface. */
  imagePath: string;
}

export type CreateRejection =
  | "invalid-scope"
  | "invalid-image"
  | "invalid-choices";

/** Turns an untrusted payload into the canonical draft, or names why it cannot.
 *
 *  Deliberately NOT a "fix it up quietly" function for choices. The repo's
 *  authoring sanitiser treats fewer than two filled options as "multiple choice
 *  was never turned on" and returns null for both fields, which is exactly
 *  right for the one-tap image-only question. But if a caller SENT options and
 *  they sanitise away to nothing, that is a malformed multiple-choice question,
 *  not an image-only one, and silently storing it as image-only would lose the
 *  author's intent. So the two cases are told apart rather than conflated. */
export function buildQuestionCreateDraft(
  raw: Record<string, unknown>,
  uid: string,
  visibility: QuestionVisibility,
  classId: string | null,
): { draft: QuestionCreateDraft } | { rejection: CreateRejection } {
  const scope = sanitizeQuestionScope(raw);
  if (!scope) return { rejection: "invalid-scope" };

  const imagePath = storageObjectPath(raw.imageUrl);
  if (!isOwnedQuestionImagePath(imagePath, uid, visibility, classId)) {
    return { rejection: "invalid-image" };
  }

  const authoring = sanitizeQuestionAuthoringState(raw);
  if (!authoring.choices && hasAnyChoiceText(raw.choices)) {
    return { rejection: "invalid-choices" };
  }
  // A set of options with nothing marked correct is not a usable question.
  if (authoring.choices && !authoring.correctChoice) {
    return { rejection: "invalid-choices" };
  }

  return {
    draft: { scope, authoring, imageUrl: raw.imageUrl as string, imagePath: imagePath as string },
  };
}

/** Whether the caller actually tried to send options, as opposed to omitting
 *  them (the image-only question the one-tap capture creates). */
function hasAnyChoiceText(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  return CHOICE_LABELS.some((label) => {
    const value = record[label];
    return typeof value === "string" && value.trim().length > 0;
  });
}
