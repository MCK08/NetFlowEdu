// Pure helpers for publishing a moderated answer image.
//
// Split out from the callable so the path construction, MIME validation and
// ownership checks are testable without Firestore, Storage or Vision.

export type AnswerMethod = "photo" | "drawing";

/** MIME allowlist. The DECLARED content type is never trusted on its own —
 *  the server re-reads the stored object's real metadata and checks it
 *  against this same list (see submitAnswerForModeration). */
export const ALLOWED_ANSWER_MIME: readonly string[] = ["image/png", "image/jpeg"];

export const MAX_ANSWER_BYTES = 10 * 1024 * 1024;

export function isAllowedAnswerMime(value: unknown): value is string {
  return typeof value === "string" && ALLOWED_ANSWER_MIME.includes(value);
}

export function extensionForMime(mime: string): "png" | "jpg" {
  return mime === "image/png" ? "png" : "jpg";
}

/** Quarantine path for one submission. Deterministic, so a retry of the same
 *  gesture overwrites its own object instead of littering orphans. */
export function buildQuarantinePath(uid: string, submissionId: string, mime: string): string {
  return `moderation/pending/${uid}/${submissionId}/upload.${extensionForMime(mime)}`;
}

/**
 * Verifies that a client-supplied storage path is the one this caller's
 * submission is allowed to use.
 *
 * The path arrives from the client, so it is treated as a claim, not a fact.
 * Comparing against the deterministic path we would have built ourselves
 * rejects every interesting attack at once: another user's uid segment, a
 * different submission's folder, `..` traversal, and a path pointing at the
 * already-approved answers/ tree.
 */
export function isOwnedQuarantinePath(
  path: unknown,
  uid: string,
  submissionId: string,
  mime: string,
): boolean {
  return typeof path === "string" && path === buildQuarantinePath(uid, submissionId, mime);
}

/**
 * Phase 97 — where the class teacher's review copy of a quarantined image
 * lives while a decision is open.
 *
 * A separate object rather than a token on the quarantine object itself, for
 * one reason: revocation must be provable. Deleting an object ends every URL
 * that pointed at it, in production and in the emulator alike, whereas
 * rewriting token metadata is honoured differently by the two. Deterministic,
 * so re-minting replaces rather than accumulates. Storage rules deny every
 * client read here; the only way in is the token the review callable hands to
 * the authorized teacher.
 */
export function buildReviewAccessPath(submissionId: string, mime: string): string {
  return `moderation/review/${submissionId}/upload.${extensionForMime(mime)}`;
}

/**
 * Where an APPROVED answer image is published.
 *
 * Mirrors the parent question's visibility, exactly like the pre-existing
 * uploadAnswerImage did, so storage.rules' unchanged read rules keep
 * governing who can see it and no already-published answer is affected.
 *
 * Named by submissionId rather than a timestamp so publishing twice is
 * idempotent at the Storage layer too: the second copy overwrites the first
 * object instead of creating a second file.
 */
export function buildApprovedAnswerPath(
  questionVisibility: string,
  questionId: string,
  uid: string,
  submissionId: string,
  mime: string,
): string {
  const accessLevel = questionVisibility === "public" ? "public" : "private";
  return `answers/${accessLevel}/${questionId}/${uid}/${submissionId}.${extensionForMime(mime)}`;
}

/**
 * Builds the Firebase download URL for a published object.
 *
 * Uses the download-token scheme so the resulting `imageUrl` is the same
 * shape the client already stores and renders — the answer UI, the feed and
 * the image viewer keep working with no change. The token is generated
 * server-side and only ever attached to content that has already been
 * approved.
 */
export function buildDownloadUrl(
  bucket: string,
  path: string,
  token: string,
  // Phase 97 — the emulator suite serves objects from its own host; see
  // answerFinalization.storageDownloadBase. Production callers omit it.
  base = "https://firebasestorage.googleapis.com",
): string {
  return `${base}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
