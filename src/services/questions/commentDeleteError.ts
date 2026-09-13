// Phase 93 — the comment-delete error model, in its own dependency-free file.
//
// WHY NOT IN comments.ts
//
// comments.ts imports @services/firebase/config, which cannot be loaded under
// Jest (its platform persistence layer is ESM and the transform does not reach
// it — verified empirically in Phase 87, and hit again in Phase 89 when an
// error type imported from a service broke a mapper's unit test). Anything that
// turns these codes into user-facing copy is exactly the kind of pure module
// that should stay testable, so the codes live here instead.
//
// Nothing here imports anything. That is the point.

export type CommentDeleteErrorCode =
  | "unauthenticated"
  | "not-author"
  | "invalid-comment"
  | "unavailable";

export class CommentDeleteError extends Error {
  constructor(public readonly code: CommentDeleteErrorCode) {
    super(`comment delete refused: ${code}`);
    this.name = "CommentDeleteError";
  }
}

/** The sentence a composer shows for each refusal.
 *
 *  Each keeps its own: someone who is not the author, someone whose session has
 *  expired, and someone whose connection dropped need three different next
 *  actions, and collapsing them would leave a person retrying something that
 *  cannot succeed. */
export function commentDeleteMessage(code: CommentDeleteErrorCode): string {
  switch (code) {
    case "unauthenticated":
      return "Yorumu silmek için oturum açmış olman gerekir.";
    case "not-author":
      return "Bu yorumu yalnızca yazarı silebilir.";
    case "invalid-comment":
      return "Bu yorum artık bulunamıyor.";
    default:
      return "Yorum silinemedi. Bağlantını kontrol edip tekrar dene.";
  }
}
