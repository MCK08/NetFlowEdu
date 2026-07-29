import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

export interface SocialMetaFields {
  friendCount: number;
  incomingRequestCount: number;
  outgoingRequestCount: number;
}

const ZERO_META: SocialMetaFields = {
  friendCount: 0,
  incomingRequestCount: 0,
  outgoingRequestCount: 0,
};

export function socialMetaRef(db: Firestore, uid: string): DocumentReference {
  return db.collection("users").doc(uid).collection("socialMeta").doc("summary");
}

// A user who signed up before this phase (or has simply never had a
// friendship event) has no summary doc yet — treated as all-zero, never as
// an error and never as a reason to re-run onboarding (spec section 6).
export async function readMeta(
  tx: Transaction,
  ref: DocumentReference,
): Promise<SocialMetaFields> {
  const snap = await tx.get(ref);
  if (!snap.exists) return { ...ZERO_META };
  const data = snap.data() ?? {};
  return {
    friendCount: typeof data.friendCount === "number" ? data.friendCount : 0,
    incomingRequestCount:
      typeof data.incomingRequestCount === "number" ? data.incomingRequestCount : 0,
    outgoingRequestCount:
      typeof data.outgoingRequestCount === "number" ? data.outgoingRequestCount : 0,
  };
}

// Applies a delta on top of an already-read current value and writes the
// result — never a bare FieldValue.increment(), specifically so every
// counter can be floored at 0 (spec: "Sayaçlar hiçbir zaman negatif
// olamaz") and so idempotency can be enforced by the CALLER deciding
// whether to invoke this at all (each friends/* callable only calls this
// when a friendship's state is genuinely transitioning — a repeated
// accept/decline/cancel on a document that's already past that state skips
// the delta entirely, so applying the same mutation twice never double-counts).
export function applyMetaDelta(
  tx: Transaction,
  ref: DocumentReference,
  current: SocialMetaFields,
  delta: Partial<SocialMetaFields>,
): void {
  const next: SocialMetaFields = {
    friendCount: Math.max(0, current.friendCount + (delta.friendCount ?? 0)),
    incomingRequestCount: Math.max(
      0,
      current.incomingRequestCount + (delta.incomingRequestCount ?? 0),
    ),
    outgoingRequestCount: Math.max(
      0,
      current.outgoingRequestCount + (delta.outgoingRequestCount ?? 0),
    ),
  };
  tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
