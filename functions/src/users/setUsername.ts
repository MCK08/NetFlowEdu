import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

// Claims a username for the caller. Uniqueness is enforced via a
// usernames/{normalized} reservation doc written in the same transaction as
// the users/{uid}.username update — the reservation doc is never readable
// or writable by clients (falls through Firestore's default-deny catch-all),
// so this is the only path a username can ever be set through, matching
// the existing pattern of role/points being Cloud-Function-only. Normalized
// to lowercase: uniqueness is case-insensitive, and the stored value is
// what's displayed (this app has no separate "display case" for usernames).
export const setUsername = onCall<{ username: string }>(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  }

  const raw = request.data?.username;
  if (typeof raw !== "string" || !USERNAME_PATTERN.test(raw)) {
    throw new HttpsError(
      "invalid-argument",
      "Kullanıcı adı 3-20 karakter olmalı ve yalnızca harf, rakam, alt çizgi içermeli.",
    );
  }
  const normalized = raw.toLowerCase();

  const db = getFirestore();
  const usernameRef = db.collection("usernames").doc(normalized);
  const userRef = db.collection("users").doc(caller.uid);

  await db.runTransaction(async (tx) => {
    const [usernameSnap, userSnap] = await Promise.all([tx.get(usernameRef), tx.get(userRef)]);

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Kullanıcı bulunamadı.");
    }
    if (usernameSnap.exists && usernameSnap.data()?.uid !== caller.uid) {
      throw new HttpsError("already-exists", "Bu kullanıcı adı zaten alınmış.");
    }
    if (userSnap.data()?.username) {
      throw new HttpsError("failed-precondition", "Kullanıcı adınız zaten belirlenmiş.");
    }

    tx.set(usernameRef, { uid: caller.uid, createdAt: FieldValue.serverTimestamp() });
    tx.update(userRef, { username: normalized, updatedAt: FieldValue.serverTimestamp() });
  });

  return { success: true, username: normalized } as const;
});
