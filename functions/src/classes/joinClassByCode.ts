import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { normalizeJoinCode } from "./joinCode";

interface JoinClassByCodeRequest {
  code: string;
}

interface JoinClassByCodeResult {
  classId: string;
  className: string;
  alreadyMember: boolean;
}

// Only students join classes this way in this phase — a teacher's own
// membership row is created by createClass itself, and there's no product
// requirement yet for a teacher to join another teacher's class.
export const joinClassByCode = onCall<JoinClassByCodeRequest>(
  { region: "us-central1" },
  async (request): Promise<JoinClassByCodeResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    if (caller.token.role !== "student") {
      throw new HttpsError("permission-denied", "Sadece öğrenciler sınıfa katılabilir.");
    }

    const rawCode = request.data?.code;
    if (typeof rawCode !== "string" || rawCode.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Sınıf kodu gerekli.");
    }
    const code = normalizeJoinCode(rawCode);

    const db = getFirestore();
    const codeRef = db.collection("classJoinCodes").doc(code);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) {
      throw new HttpsError("not-found", "Geçersiz sınıf kodu.");
    }
    const classId = codeSnap.data()?.classId;
    if (typeof classId !== "string") {
      throw new HttpsError("not-found", "Geçersiz sınıf kodu.");
    }

    const classRef = db.collection("classes").doc(classId);
    const memberRef = classRef.collection("members").doc(caller.uid);
    const studentUserRef = db.collection("users").doc(caller.uid);

    return db.runTransaction(async (tx) => {
      const [classSnap, memberSnap, studentSnap] = await Promise.all([
        tx.get(classRef),
        tx.get(memberRef),
        tx.get(studentUserRef),
      ]);

      if (!classSnap.exists || classSnap.data()?.status !== "active") {
        throw new HttpsError("not-found", "Bu sınıf artık mevcut değil.");
      }
      const classData = classSnap.data() ?? {};

      // Cross-organization join is rejected even with a technically valid
      // code — a code should never let a student cross an org boundary.
      if ((classData.organizationId ?? null) !== (caller.token.organizationId ?? null)) {
        throw new HttpsError("permission-denied", "Bu sınıfa katılamazsınız.");
      }

      // Idempotent: re-submitting a code you already used (double-tap,
      // retry after a flaky network response) is a no-op success, not an
      // error — never double-increments memberCount.
      if (memberSnap.exists) {
        return { classId, className: classData.name ?? "", alreadyMember: true };
      }

      const studentData = studentSnap.data() ?? {};
      tx.set(memberRef, {
        uid: caller.uid,
        role: "student",
        joinedAt: FieldValue.serverTimestamp(),
        displayName: studentData.displayName ?? "",
        username: studentData.username ?? null,
        photoURL: studentData.photoURL ?? null,
      });
      tx.update(classRef, {
        memberCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { classId, className: classData.name ?? "", alreadyMember: false };
    });
  },
);
