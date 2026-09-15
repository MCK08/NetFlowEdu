// Phase 102 — the class-teacher message-removal contract, in a dependency-free
// module (the same reason commentDeleteError.ts exists: copy and codes stay
// unit-testable without loading the Firebase config).
//
// The teacher may remove a STUDENT'S message in THEIR OWN class, through the
// removeClassMessage Cloud Function and nothing else. This module holds only
// what the screen needs to show for it: the affordance's wording, the
// confirmation, the removed-message placeholder, and one sentence per refusal.
// None of it carries an id, a uid or a reason field.

export const REMOVE_MESSAGE_ACTION_LABEL = "Mesajı kaldır";
export const REMOVE_MESSAGE_CONFIRM_TITLE = "Bu öğrenci mesajını kaldırmak istiyor musun?";
export const REMOVE_MESSAGE_CONFIRM_LABEL = "Kaldır";
export const REMOVE_MESSAGE_CANCEL_LABEL = "Vazgeç";
export const REMOVED_MESSAGE_PLACEHOLDER = "Bu mesaj öğretmen tarafından kaldırıldı.";

export type RemoveMessageErrorCode =
  | "unauthenticated"
  | "not-class-teacher"
  | "not-found"
  | "unavailable";

export class RemoveMessageError extends Error {
  constructor(public readonly code: RemoveMessageErrorCode) {
    super(`message removal refused: ${code}`);
    this.name = "RemoveMessageError";
  }
}

/** Maps a Functions error code (e.g. "functions/permission-denied") to the
 *  client's own vocabulary. Anything unrecognised is a connectivity-class
 *  failure the user may retry. */
export function mapRemoveMessageError(code: string | undefined): RemoveMessageErrorCode {
  if (code === "functions/unauthenticated") return "unauthenticated";
  if (code === "functions/permission-denied") return "not-class-teacher";
  if (code === "functions/not-found" || code === "functions/invalid-argument") return "not-found";
  return "unavailable";
}

export function removeMessageErrorMessage(code: RemoveMessageErrorCode): string {
  switch (code) {
    case "unauthenticated":
      return "Mesajı kaldırmak için oturum açmış olman gerekir.";
    case "not-class-teacher":
      return "Bu mesajı yalnızca sınıfın öğretmeni kaldırabilir.";
    case "not-found":
      return "Bu mesaj artık bulunamıyor.";
    default:
      return "Mesaj kaldırılamadı. Bağlantını kontrol edip tekrar dene.";
  }
}

/** Whether the viewer gets the remove affordance on this bubble at all.
 *
 *  The server is the authority (removeClassMessage checks
 *  classes/{classId}.teacherId); this only decides what to draw. A class's
 *  member list can hold exactly one teacher — its owner (createClass adds the
 *  owner; joinClassByCode admits students only) — so "a teacher who can see
 *  this chat" is that class's teacher. Only a confirmed, not-yet-removed
 *  student message that is not the viewer's own qualifies. */
export function canRemoveMessage(
  viewer: { uid: string; role: "teacher" | "student" } | null,
  message: { senderId: string; senderRole: "teacher" | "student"; deleted: boolean; status?: string },
): boolean {
  if (!viewer || viewer.role !== "teacher") return false;
  if (message.senderRole !== "student") return false;
  if (message.senderId === viewer.uid) return false;
  if (message.deleted) return false;
  if (message.status) return false;
  return true;
}
