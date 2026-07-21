import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

interface RequestTeacherRoleRequest {
  displayName: string;
  organizationName: string;
}

// Records a teacher account request without granting any role — the caller
// keeps whatever role onUserCreate assigned (always "student"). Only
// adminSetUserRole (see ../admin/setUserRole.ts) can ever promote a role,
// and it's never invoked from here. uid/email come from the caller's own
// auth token, never from request.data, so a client can only ever request
// teacher access for itself.
export const requestTeacherRole = onCall<RequestTeacherRoleRequest>(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  }

  const { displayName, organizationName } = request.data ?? {};

  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Geçersiz ad soyad.");
  }
  if (typeof organizationName !== "string" || organizationName.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Kurum adı gerekli.");
  }

  const db = getFirestore();
  await db
    .collection("teacherRequests")
    .doc(caller.uid)
    .set({
      uid: caller.uid,
      displayName: displayName.trim(),
      email: caller.token.email ?? "",
      organizationName: organizationName.trim(),
      requestedAt: FieldValue.serverTimestamp(),
      status: "pending",
    });

  return { success: true } as const;
});
