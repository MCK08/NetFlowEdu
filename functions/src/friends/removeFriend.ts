import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { assertEligibleUser, requireOtherUid } from "./eligibility";
import { buildFriendshipPairId } from "./pairId";
import { applyMetaDelta, readMeta, socialMetaRef } from "./socialMeta";

interface RemoveFriendRequest {
  otherUid: string;
}

interface RemoveFriendResult {
  removed: boolean;
}

export const removeFriend = onCall<RemoveFriendRequest>(
  { region: "us-central1" },
  async (request): Promise<RemoveFriendResult> => {
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
        // Already removed by an earlier call (or the other side) — safe,
        // idempotent "nothing to remove" outcome.
        throw new HttpsError("not-found", "Arkadaşlık bulunamadı.");
      }
      const data = snap.data() ?? {};

      if (data.status !== "accepted") {
        throw new HttpsError(
          "failed-precondition",
          "Bu kullanıcıyla henüz arkadaş değilsiniz.",
        );
      }
      const participantIds: unknown = data.participantIds;
      if (!Array.isArray(participantIds) || !participantIds.includes(caller.uid)) {
        throw new HttpsError("permission-denied", "Bu arkadaşlığı kaldırma yetkiniz yok.");
      }

      const [callerMeta, otherMeta] = await Promise.all([
        readMeta(tx, callerMetaRef),
        readMeta(tx, otherMetaRef),
      ]);

      tx.delete(friendshipRef);
      applyMetaDelta(tx, callerMetaRef, callerMeta, { friendCount: -1 });
      applyMetaDelta(tx, otherMetaRef, otherMeta, { friendCount: -1 });

      return { removed: true };
    });
  },
);
