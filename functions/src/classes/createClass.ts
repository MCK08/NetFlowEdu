import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { generateJoinCode } from "./joinCode";

interface CreateClassRequest {
  name: string;
}

interface CreateClassResult {
  classId: string;
  joinCode: string;
}

const MAX_NAME_LENGTH = 80;
const MAX_CODE_ATTEMPTS = 8;

// organizationId is always taken from the caller's own custom claim, never
// request.data — a teacher can only ever create a class in their own org,
// matching every other write in this app that trusts claims over client
// input (see firestore.rules' organizationId()).
export const createClass = onCall<CreateClassRequest>(
  { region: "us-central1" },
  async (request): Promise<CreateClassResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    if (caller.token.role !== "teacher") {
      throw new HttpsError("permission-denied", "Sadece öğretmenler sınıf oluşturabilir.");
    }
    const organizationId = (caller.token.organizationId as string | null | undefined) ?? null;
    if (!organizationId) {
      throw new HttpsError(
        "failed-precondition",
        "Sınıf oluşturmak için bir kuruma bağlı olmanız gerekiyor.",
      );
    }

    const rawName = request.data?.name;
    if (typeof rawName !== "string" || rawName.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Sınıf adı gerekli.");
    }
    const name = rawName.trim().slice(0, MAX_NAME_LENGTH);

    const db = getFirestore();
    const classRef = db.collection("classes").doc();

    // Uniqueness is enforced the same way as setUsername: a reservation doc
    // (classJoinCodes/{code}) written in the same transaction as the class
    // itself. The candidate code is generated and pre-checked outside the
    // transaction (cheap, avoids retrying the whole transaction on every
    // collision), then re-verified for uniqueness at commit time inside it —
    // a collision surviving both checks is astronomically unlikely at this
    // alphabet size, and simply fails the whole call with 'already-exists'
    // for the client to retry, rather than looping indefinitely server-side.
    let joinCode = "";
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = generateJoinCode();
      const snap = await db.collection("classJoinCodes").doc(candidate).get();
      if (!snap.exists) {
        joinCode = candidate;
        break;
      }
    }
    if (!joinCode) {
      throw new HttpsError("resource-exhausted", "Sınıf kodu oluşturulamadı. Lütfen tekrar deneyin.");
    }

    const codeRef = db.collection("classJoinCodes").doc(joinCode);
    const memberRef = classRef.collection("members").doc(caller.uid);
    const teacherUserRef = db.collection("users").doc(caller.uid);

    await db.runTransaction(async (tx) => {
      const [codeSnap, teacherSnap] = await Promise.all([tx.get(codeRef), tx.get(teacherUserRef)]);
      if (codeSnap.exists) {
        throw new HttpsError("already-exists", "Sınıf kodu çakıştı. Lütfen tekrar deneyin.");
      }
      const teacherData = teacherSnap.data() ?? {};

      tx.set(classRef, {
        name,
        organizationId,
        teacherId: caller.uid,
        joinCode,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        memberCount: 1,
        status: "active",
      });
      tx.set(codeRef, { classId: classRef.id, createdAt: FieldValue.serverTimestamp() });
      tx.set(memberRef, {
        uid: caller.uid,
        role: "teacher",
        joinedAt: FieldValue.serverTimestamp(),
        displayName: teacherData.displayName ?? "",
        username: teacherData.username ?? null,
        photoURL: teacherData.photoURL ?? null,
      });
    });

    return { classId: classRef.id, joinCode };
  },
);
