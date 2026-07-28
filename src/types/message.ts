export type ChatSenderRole = "teacher" | "student";

// A message not yet confirmed by Firestore (optimistic UI) is "pending";
// one whose write ultimately failed is "failed" (retryable). A real,
// server-confirmed message never has this field at all — see
// useClassChat's reconciliation logic.
export type ChatMessageStatus = "pending" | "failed";

// classes/{classId}/messages/{messageId} — see firestore.rules and
// src/services/firebase/classMessages.ts. senderName/senderPhoto/senderRole
// are a denormalized snapshot taken at send time (same reasoning as
// ClassMember/savedQuestions: avoid an extra profile read per rendered
// message). editedAt/deleted exist for a future edit/delete feature — this
// phase only ever writes them as null/false and never changes them
// (firestore.rules denies update/delete entirely, matching questionComments'
// immutable-after-create shape minus the delete-by-owner allowance).
//
// clientMessageId is generated on-device at send time and stored on the
// document itself — the correlation key that lets useClassChat's optimistic
// UI recognize "this incoming real-time message IS the one I already
// rendered locally" precisely, instead of fuzzy-matching by sender+text+time
// (which breaks on two genuinely identical messages sent close together).
export interface ClassMessage {
  id: string;
  clientMessageId: string;
  classId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  senderRole: ChatSenderRole;
  text: string;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
}

// What ClassChatScreen actually renders — every confirmed ClassMessage, plus
// any still-optimistic ones with a status. Kept as a superset (rather than a
// separate type) so list rendering doesn't need two different item shapes.
export type ChatListMessage = ClassMessage & { status?: ChatMessageStatus };
