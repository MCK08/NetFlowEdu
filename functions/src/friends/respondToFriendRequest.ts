import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { assertEligibleUser, requireOtherUid } from "./eligibility";
import { buildFriendshipPairId } from "./pairId";
import { applyMetaDelta, readMeta, socialMetaRef } from "./socialMeta";
import { commitNotification, prepareNotification } from "../notifications";

interface RespondToFriendRequestRequest {
  otherUid: string;
  action: "accept" | "decline";
}

interface RespondToFriendRequestResult {
  status: "accepted" | "declined";
}

export const respondToFriendRequest = onCall<RespondToFriendRequestRequest>(
  { region: "us-central1" },
  async (request): Promise<RespondToFriendRequestResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    const otherUid = requireOtherUid(request.data?.otherUid);
    const action = request.data?.action;
    if (action !== "accept" && action !== "decline") {
      throw new HttpsError("invalid-argument", "Geçersiz işlem.");
    }

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
        throw new HttpsError("not-found", "İstek bulunamadı.");
      }
      const data = snap.data() ?? {};

      if (data.status === "accepted") {
        // Repeated accept on an already-accepted relationship is a safe
        // no-op (spec: "repeated accept sayı değiştirmez"). Decline never
        // applies to an already-accepted relationship — use removeFriend.
        if (action === "accept") {
          return { status: "accepted" };
        }
        throw new HttpsError(
          "failed-precondition",
          "Bu istek zaten kabul edilmiş. Arkadaşlıktan çıkmak için farklı bir işlem kullanın.",
        );
      }

      // status === "pending" — only the RECIPIENT may accept or decline.
      if (data.recipientId !== caller.uid) {
        throw new HttpsError("permission-denied", "Bu isteği yanıtlama yetkiniz yok.");
      }

      // ---- READ PHASE (every read must precede every write) ----
      const [callerMeta, otherMeta] = await Promise.all([
        readMeta(tx, callerMetaRef),
        readMeta(tx, otherMetaRef),
      ]);
      // otherUid is the ORIGINAL requester — they're notified that the
      // caller (the recipient) accepted. Declines are deliberately silent
      // (see the `declined` branch below), so this is prepared only for
      // the accept path.
      const acceptedPlan =
        action === "accept"
          ? await prepareNotification(tx, db, {
              recipientId: otherUid,
              actorId: caller.uid,
              type: "friend_request_accepted",
              entityType: "friendship",
              entityId: pairId,
            })
          : null;

      // ---- WRITE PHASE ----
      if (action === "accept") {
        tx.update(friendshipRef, {
          status: "accepted",
          acceptedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        // caller is the recipient here; otherUid is the original requester.
        applyMetaDelta(tx, callerMetaRef, callerMeta, {
          incomingRequestCount: -1,
          friendCount: 1,
        });
        applyMetaDelta(tx, otherMetaRef, otherMeta, {
          outgoingRequestCount: -1,
          friendCount: 1,
        });
        commitNotification(tx, acceptedPlan);

        return { status: "accepted" };
      }

      tx.delete(friendshipRef);
      applyMetaDelta(tx, callerMetaRef, callerMeta, { incomingRequestCount: -1 });
      applyMetaDelta(tx, otherMetaRef, otherMeta, { outgoingRequestCount: -1 });
      return { status: "declined" };
    });
  },
);
