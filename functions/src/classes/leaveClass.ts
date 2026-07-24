import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

interface LeaveClassRequest {
  classId: string;
}

interface LeaveClassResult {
  left: boolean;
}

// A student leaving their own membership. Idempotent — leaving a class
// you're not (or no longer) a member of is a no-op success, not an error,
// so a retried/duplicate tap can never fail or double-decrement.
export const leaveClass = onCall<LeaveClassRequest>(
  { region: "us-central1" },
  async (request): Promise<LeaveClassResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }

    const classId = request.data?.classId;
    if (typeof classId !== "string" || classId.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz sınıf kimliği.");
    }

    const db = getFirestore();
    const classRef = db.collection("classes").doc(classId);
    const memberRef = classRef.collection("members").doc(caller.uid);

    return db.runTransaction(async (tx) => {
      const [classSnap, memberSnap] = await Promise.all([tx.get(classRef), tx.get(memberRef)]);

      if (!memberSnap.exists) {
        return { left: false };
      }

      // A teacher never "leaves" their own class through this path — that
      // would orphan the class (no teacher membership row) while the class
      // doc's teacherId still points at them. Class deletion/transfer is
      // out of scope for this phase.
      if (classSnap.exists && classSnap.data()?.teacherId === caller.uid) {
        throw new HttpsError(
          "failed-precondition",
          "Öğretmen kendi sınıfından bu şekilde ayrılamaz.",
        );
      }

      tx.delete(memberRef);
      if (classSnap.exists) {
        const currentCount = classSnap.data()?.memberCount;
        const nextCount = Math.max(0, (typeof currentCount === "number" ? currentCount : 1) - 1);
        tx.update(classRef, { memberCount: nextCount });
      }

      return { left: true };
    });
  },
);
