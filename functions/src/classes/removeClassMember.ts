import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

interface RemoveClassMemberRequest {
  classId: string;
  memberUid: string;
}

interface RemoveClassMemberResult {
  removed: boolean;
}

// Only the class's own teacher may remove a member — checked against the
// class document itself (teacherId), never trusting a client-asserted
// "I'm the teacher" flag, and never allowing one teacher to manage another
// teacher's class even if both have role 'teacher'.
export const removeClassMember = onCall<RemoveClassMemberRequest>(
  { region: "us-central1" },
  async (request): Promise<RemoveClassMemberResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }

    const classId = request.data?.classId;
    const memberUid = request.data?.memberUid;
    if (typeof classId !== "string" || classId.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz sınıf kimliği.");
    }
    if (typeof memberUid !== "string" || memberUid.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz üye kimliği.");
    }

    const db = getFirestore();
    const classRef = db.collection("classes").doc(classId);
    const memberRef = classRef.collection("members").doc(memberUid);

    return db.runTransaction(async (tx) => {
      const [classSnap, memberSnap] = await Promise.all([tx.get(classRef), tx.get(memberRef)]);

      if (!classSnap.exists) {
        throw new HttpsError("not-found", "Sınıf bulunamadı.");
      }
      const classData = classSnap.data() ?? {};
      if (classData.teacherId !== caller.uid) {
        throw new HttpsError("permission-denied", "Bu sınıfı yönetme izniniz yok.");
      }
      if (memberUid === classData.teacherId) {
        throw new HttpsError("failed-precondition", "Öğretmen kendini sınıftan çıkaramaz.");
      }

      if (!memberSnap.exists) {
        return { removed: false };
      }

      tx.delete(memberRef);
      const currentCount = classData.memberCount;
      const nextCount = Math.max(0, (typeof currentCount === "number" ? currentCount : 1) - 1);
      tx.update(classRef, { memberCount: nextCount });

      return { removed: true };
    });
  },
);
