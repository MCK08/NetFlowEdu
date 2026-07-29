import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";

// Admins are deliberately excluded from the friendship system (spec: "Admin
// hesaplarını bu sistemin dışında bırak") — only student/teacher accounts
// may send, receive, or hold a friendship.
const ELIGIBLE_ROLES = new Set(["student", "teacher"]);

export interface EligibleUser {
  uid: string;
  role: string;
}

// Shared by every friends/* callable — a plain (non-transactional) read
// used purely for authorization/validation before the real transaction
// starts. Throws exactly the HttpsError codes the client's error mapper
// expects: not-found (no such account), failed-precondition (inactive),
// permission-denied (admin, or any other non-student/teacher role).
export async function assertEligibleUser(
  db: Firestore,
  uid: string,
  notFoundMessage: string,
): Promise<EligibleUser> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", notFoundMessage);
  }
  const data = snap.data() ?? {};
  const role = typeof data.role === "string" ? data.role : "";
  const accountStatus = typeof data.accountStatus === "string" ? data.accountStatus : "";

  if (accountStatus !== "active") {
    throw new HttpsError("failed-precondition", "Bu kullanıcı hesabı şu anda aktif değil.");
  }
  if (!ELIGIBLE_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "Bu kullanıcıyla arkadaşlık kurulamaz.");
  }
  return { uid, role };
}

export function requireOtherUid(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Geçersiz kullanıcı kimliği.");
  }
  return raw;
}
