import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { assertEligibleUser, requireOtherUid } from "./eligibility";
import { buildFriendshipPairId } from "./pairId";
import { applyMetaDelta, readMeta, socialMetaRef } from "./socialMeta";

interface CancelFriendRequestRequest {
  otherUid: string;
}

interface CancelFriendRequestResult {
  cancelled: boolean;
}

export const cancelFriendRequest = onCall<CancelFriendRequestRequest>(
  { region: "us-central1" },
  async (request): Promise<CancelFriendRequestResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    const otherUid = requireOtherUid(request.data?.otherUid);

    const db = getFirestore();
    await assertEligibleUser(db, caller.uid, "Hesabınız bulunamadı.");
    await assertEligibleUser(db, otherUid, "Kullanıcı bulunamadı.");

    const pairId = buildFriendshipPairId(caller.uid, otherUid);
    const friendshipRef = db.collection("friendships").doc(pairId);
    const callerMetaRef = socialMetaRef(db, caller.uid);
    const otherMetaRef = socialMetaRef(db, otherUid);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(friendshipRef);
      if (!snap.exists) {
        // Already cancelled/resolved by an earlier call — safe, idempotent
        // "nothing to cancel" outcome, not a crash.
        throw new HttpsError("not-found", "İstek bulunamadı.");
      }
      const data = snap.data() ?? {};

      if (data.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          "Bu istek zaten kabul edilmiş. Arkadaşlıktan çıkmak için farklı bir işlem kullanın.",
        );
      }
      // Only the ORIGINAL SENDER may cancel — the recipient uses
      // respondToFriendRequest(decline) instead (spec: "recipient iptal edemez").
      if (data.requesterId !== caller.uid) {
        throw new HttpsError("permission-denied", "Bu isteği yalnızca gönderen iptal edebilir.");
      }

      const [callerMeta, otherMeta] = await Promise.all([
        readMeta(tx, callerMetaRef),
        readMeta(tx, otherMetaRef),
      ]);

      tx.delete(friendshipRef);
      applyMetaDelta(tx, callerMetaRef, callerMeta, { outgoingRequestCount: -1 });
      applyMetaDelta(tx, otherMetaRef, otherMeta, { incomingRequestCount: -1 });

      return { cancelled: true };
    });
  },
);
