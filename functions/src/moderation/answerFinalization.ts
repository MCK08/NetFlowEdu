import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import type { getStorage } from "firebase-admin/storage";

import { AnswerMethod, buildDownloadUrl } from "./answerPublication";

// Phase 97 — THE ONE WAY an approved answer becomes a published answer.
//
// Before this file, publication lived inline in submitAnswerForModeration's
// approval branch, which was fine while automated approval was the only
// caller. Phase 97 adds a second caller — the class teacher's manual
// approval — and the moment there are two callers the shape of a published
// answer must have exactly one author. Otherwise the two paths drift: a field
// added to one, a default changed in the other, and the feed starts rendering
// two kinds of answer that were supposed to be the same thing.
//
// So both callers do the same two steps, in the same order, through the
// same functions:
//
//   1. publishApprovedAnswerObject — OUTSIDE the transaction, because Storage
//      I/O cannot run inside one. Copies the quarantined object to its
//      deterministic published path and attaches the download token. Doing
//      it twice overwrites one object rather than creating two.
//   2. finalizeApprovedAnswer — INSIDE the transaction that flips the
//      submission to `approved`. Writes the answer document, whose shape is
//      defined once, below, in buildPublishedAnswerDocument.
//
// onAnswerCreate then does what it has always done on that one document:
// answerCount += 1 and the question owner's notification. Neither caller
// touches a counter or a notification directly, which is what keeps "exactly
// once" a property of the document rather than of two pieces of code.

export type StorageBucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

const PRODUCTION_DOWNLOAD_BASE = "https://firebasestorage.googleapis.com";

/**
 * Where download URLs resolve. Production always; the Storage emulator when
 * the function itself is running under the emulator suite, so an image
 * published during local QA actually loads instead of pointing at a bucket
 * the emulator never wrote to.
 */
export function storageDownloadBase(): string {
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  return host ? `http://${host}` : PRODUCTION_DOWNLOAD_BASE;
}

export interface PublishAnswerObjectParams {
  bucket: StorageBucket;
  quarantinePath: string;
  approvedPath: string;
  contentType: string;
  /** Minted by the caller so a retry can re-apply the SAME token. */
  downloadToken: string;
}

/**
 * Copies the quarantined object to its published location and attaches the
 * download token that makes it renderable by the answer UI.
 *
 * Idempotent by construction: the destination is deterministic (see
 * buildApprovedAnswerPath) and the token is supplied, not minted here, so
 * re-running with the same inputs leaves the object exactly as it was.
 */
export async function publishApprovedAnswerObject(params: PublishAnswerObjectParams): Promise<string> {
  const { bucket, quarantinePath, approvedPath, contentType, downloadToken } = params;
  await bucket.file(quarantinePath).copy(bucket.file(approvedPath));
  await bucket.file(approvedPath).setMetadata({
    contentType,
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  });
  return buildDownloadUrl(bucket.name, approvedPath, downloadToken, storageDownloadBase());
}

/**
 * Re-asserts a specific download token on a published object.
 *
 * Needed for one narrow race only: two reviewers approving the same
 * submission at the same instant each publish the object with their own
 * freshly minted token before the transaction decides which of them wins.
 * The loser's setMetadata may have landed last, leaving the object carrying a
 * token the winning answer document does not reference. The loser repairs
 * that by re-applying the winner's token, read from the winner's document.
 */
export async function reassertPublishedToken(
  bucket: StorageBucket,
  approvedPath: string,
  contentType: string,
  downloadToken: string,
): Promise<void> {
  await bucket.file(approvedPath).setMetadata({
    contentType,
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  });
}

/** The token a published imageUrl carries, or null when it carries none. */
export function extractDownloadToken(imageUrl: unknown): string | null {
  if (typeof imageUrl !== "string") return null;
  const match = /[?&]token=([^&]+)/.exec(imageUrl);
  const token = match?.[1];
  return token ? decodeURIComponent(token) : null;
}

export interface PublishedAnswerInput {
  questionId: string;
  ownerId: string;
  imageUrl: string;
  method: AnswerMethod;
  /** Server clock at publication. */
  now: number;
}

/**
 * The published answer document. Defined ONCE.
 *
 * Every field the feed, the answer list, the like callable and onAnswerCreate
 * read is here and nowhere else — a manual approval and an automated one
 * cannot produce different answers because neither of them spells the shape.
 */
export function buildPublishedAnswerDocument(input: PublishedAnswerInput): {
  questionId: string;
  ownerId: string;
  imageUrl: string;
  method: AnswerMethod;
  likeCount: number;
  createdAt: Date;
} {
  return {
    questionId: input.questionId,
    ownerId: input.ownerId,
    imageUrl: input.imageUrl,
    method: input.method,
    likeCount: 0,
    createdAt: new Date(input.now),
  };
}

/**
 * Writes the answer document inside the caller's transaction.
 *
 * The caller has already decided, inside that same transaction, that the
 * submission is moving to `approved` and has chosen `answerRef` — so the
 * status flip and the answer's existence commit together or not at all.
 */
export function finalizeApprovedAnswer(
  tx: Transaction,
  answerRef: DocumentReference,
  input: PublishedAnswerInput,
): void {
  tx.set(answerRef, buildPublishedAnswerDocument(input));
}
