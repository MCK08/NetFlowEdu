import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { PROMOTABLE_ROLES, ROLES_ALLOWED_TO_PROMOTE, UserRole } from "../utils/claims";

interface SetUserRoleRequest {
  targetUid: string;
  role: UserRole;
  organizationId: string | null;
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (PROMOTABLE_ROLES as string[]).includes(value);
}

// Trusted, server-only role promotion. Never wired to public UI in Phase 2 —
// this exists so a future admin panel has a safe path to call, not so it can
// be exposed as-is. The caller's own custom claims (not any client-supplied
// field) decide whether the call is authorized:
//   - organization_admin may only promote within their own organization, and
//     may not grant platform_admin.
//   - platform_admin may promote anyone, anywhere.
export const adminSetUserRole = onCall<SetUserRoleRequest>(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  }

  const callerRole = caller.token.role;
  const callerOrgId = (caller.token.organizationId as string | null) ?? null;

  if (!ROLES_ALLOWED_TO_PROMOTE.includes(callerRole)) {
    throw new HttpsError("permission-denied", "Bu işlemi yapma yetkiniz yok.");
  }

  const { targetUid, role, organizationId } = request.data ?? {};

  if (typeof targetUid !== "string" || targetUid.length === 0) {
    throw new HttpsError("invalid-argument", "Geçersiz kullanıcı kimliği.");
  }
  if (!isUserRole(role)) {
    throw new HttpsError("invalid-argument", "Geçersiz rol.");
  }
  if (organizationId !== null && typeof organizationId !== "string") {
    throw new HttpsError("invalid-argument", "Geçersiz kurum kimliği.");
  }

  if (callerRole === "organization_admin") {
    if (role === "organization_admin" && targetUid !== caller.uid) {
      // org_admins may promote teachers within their org, but granting
      // another org_admin is reserved for platform_admin.
      throw new HttpsError("permission-denied", "Bu rolü atama yetkiniz yok.");
    }
    if (organizationId !== callerOrgId) {
      throw new HttpsError(
        "permission-denied",
        "Yalnızca kendi kurumunuzdaki kullanıcıları güncelleyebilirsiniz.",
      );
    }
  }

  const auth = getAuth();
  const db = getFirestore();
  const userRef = db.collection("users").doc(targetUid);

  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "Kullanıcı bulunamadı.");
  }

  await auth.setCustomUserClaims(targetUid, { role, organizationId });

  await userRef.update({
    role,
    organizationId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { success: true } as const;
});
