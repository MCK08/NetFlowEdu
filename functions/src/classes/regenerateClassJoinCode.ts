import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { generateJoinCode } from "./joinCode";

interface RegenerateClassJoinCodeRequest {
  classId: string;
}

interface RegenerateClassJoinCodeResult {
  joinCode: string;
}

const MAX_CODE_ATTEMPTS = 8;

// Invalidates the old code (deletes its reservation doc) and mints a new
// one — e.g. after a code leaks to someone outside the class. Only the
// class's own teacher may do this.
export const regenerateClassJoinCode = onCall<RegenerateClassJoinCodeRequest>(
  { region: "us-central1" },
  async (request): Promise<RegenerateClassJoinCodeResult> => {
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
    const classSnap = await classRef.get();
    if (!classSnap.exists) {
      throw new HttpsError("not-found", "Sınıf bulunamadı.");
    }
    const classData = classSnap.data() ?? {};
    if (classData.teacherId !== caller.uid) {
      throw new HttpsError("permission-denied", "Bu sınıfı yönetme izniniz yok.");
    }
    const oldCode = classData.joinCode;

    let newCode = "";
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = generateJoinCode();
      if (candidate === oldCode) continue;
      const snap = await db.collection("classJoinCodes").doc(candidate).get();
      if (!snap.exists) {
        newCode = candidate;
        break;
      }
    }
    if (!newCode) {
      throw new HttpsError("resource-exhausted", "Yeni kod oluşturulamadı. Lütfen tekrar deneyin.");
    }

    const newCodeRef = db.collection("classJoinCodes").doc(newCode);

    await db.runTransaction(async (tx) => {
      const newCodeSnap = await tx.get(newCodeRef);
      if (newCodeSnap.exists) {
        throw new HttpsError("already-exists", "Sınıf kodu çakıştı. Lütfen tekrar deneyin.");
      }

      tx.set(newCodeRef, { classId, createdAt: FieldValue.serverTimestamp() });
      tx.update(classRef, { joinCode: newCode, updatedAt: FieldValue.serverTimestamp() });
      if (typeof oldCode === "string" && oldCode.length > 0) {
        tx.delete(db.collection("classJoinCodes").doc(oldCode));
      }
    });

    return { joinCode: newCode };
  },
);
