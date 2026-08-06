export type AnswerMethod = "photo" | "drawing";

// Phase 17B: buildAnswerImagePath was REMOVED from here.
//
// The client no longer decides where an answer image lands. It uploads to a
// private quarantine path (see answerQuarantine.ts) and
// submitAnswerForModeration derives the approved path server-side from the
// question document — see functions/src/moderation/answerPublication.ts's
// buildApprovedAnswerPath. Keeping a client-side builder would have been
// dead code that still looked authoritative, and storage.rules now denies
// every client write to answers/ anyway.
//
// The content-type helpers stay: the quarantine upload needs them, and they
// are the single place the photo/drawing -> MIME mapping is defined.

export function getAnswerFileExtension(method: AnswerMethod): "png" | "jpg" {
  return method === "drawing" ? "png" : "jpg";
}

export function getAnswerContentType(method: AnswerMethod): "image/png" | "image/jpeg" {
  return method === "drawing" ? "image/png" : "image/jpeg";
}

/** Where an UNMODERATED answer image is uploaded.
 *
 *  Must match functions/src/moderation/answerPublication.ts's
 *  buildQuarantinePath exactly: the server rebuilds this path itself and
 *  rejects the request when the client's claim does not match, so a drift
 *  here fails closed rather than opening a hole.
 *
 *  Deterministic in (uid, submissionId), so retrying one gesture overwrites
 *  its own object instead of leaving an orphan behind.
 */
export function buildQuarantinePath(
  uid: string,
  submissionId: string,
  contentType: string,
): string {
  const extension = contentType === "image/png" ? "png" : "jpg";
  return `moderation/pending/${uid}/${submissionId}/upload.${extension}`;
}
