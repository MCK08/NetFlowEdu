import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { assertEligibleUser, requireOtherUid } from "./eligibility";
import { buildFriendshipPairId } from "./pairId";
import { applyMetaDelta, readMeta, socialMetaRef } from "./socialMeta";
import { createNotificationInTransaction, getActorSnapshot } from "../notifications";

interface SendFriendRequestRequest {
  otherUid: string;
}

interface SendFriendRequestResult {
  status: "pending" | "accepted";
  created: boolean;
}

export const sendFriendRequest = onCall<SendFriendRequestRequest>(
  { region: "us-central1" },
  async (request): Promise<SendFriendRequestResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    const otherUid = requireOtherUid(request.data?.otherUid);
    if (otherUid === caller.uid) {
      throw new HttpsError("invalid-argument", "Kendinize arkadaşlık isteği gönderemezsiniz.");
    }

    const db = getFirestore();
    await assertEligibleUser(db, caller.uid, "Hesabınız bulunamadı.");
    await assertEligibleUser(db, otherUid, "Kullanıcı bulunamadı.");

    // pairId is ALWAYS recomputed here from the two real UIDs — never
    // trusted from the client (spec: "client'tan gelen pairId'ye
    // güvenilmemeli").
    const pairId = buildFriendshipPairId(caller.uid, otherUid);
    const friendshipRef = db.collection("friendships").doc(pairId);
    const callerMetaRef = socialMetaRef(db, caller.uid);
    const otherMetaRef = socialMetaRef(db, otherUid);

    return db.runTransaction(async (tx) => {
      const friendshipSnap = await tx.get(friendshipRef);

      if (!friendshipSnap.exists) {
        const [callerMeta, otherMeta] = await Promise.all([
          readMeta(tx, callerMetaRef),
          readMeta(tx, otherMetaRef),
        ]);

        tx.set(friendshipRef, {
          participantIds: [caller.uid, otherUid].sort(),
          requesterId: caller.uid,
          recipientId: otherUid,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          acceptedAt: null,
          schemaVersion: 1,
        });
        applyMetaDelta(tx, callerMetaRef, callerMeta, { outgoingRequestCount: 1 });
        applyMetaDelta(tx, otherMetaRef, otherMeta, { incomingRequestCount: 1 });

        const actorSnapshot = await getActorSnapshot(tx, db, caller.uid);
        await createNotificationInTransaction(tx, db, {
          recipientId: otherUid,
          actorId: caller.uid,
          actorSnapshot,
          type: "friend_request_received",
          entityType: "friendship",
          entityId: pairId,
        });

        return { status: "pending", created: true };
      }

      const data = friendshipSnap.data() ?? {};

      if (data.status === "accepted") {
        throw new HttpsError("already-exists", "Zaten arkadaşsınız.");
      }

      // Already-pending: two sub-cases.
      if (data.requesterId === caller.uid) {
        // The caller's own earlier request is still pending — re-submitting
        // (double-tap, retry) is a no-op, not a second document/second
        // counter bump (spec: "duplicate request idempotent").
        return { status: "pending", created: false };
      }

      // Reverse pending request: `otherUid` already sent ME a pending
      // request, and I'm now sending one back. Treated as accepting their
      // existing request rather than creating a second, symmetric pending
      // document (spec section 5 — chosen behavior, applied consistently
      // here and in respondToFriendRequest).
      const [callerMeta, otherMeta] = await Promise.all([
        readMeta(tx, callerMetaRef),
        readMeta(tx, otherMetaRef),
      ]);
      tx.update(friendshipRef, {
        status: "accepted",
        acceptedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // data.requesterId is the ORIGINAL sender (otherUid); caller is the
      // original recipient.
      applyMetaDelta(tx, otherMetaRef, otherMeta, {
        outgoingRequestCount: -1,
        friendCount: 1,
      });
      applyMetaDelta(tx, callerMetaRef, callerMeta, {
        incomingRequestCount: -1,
        friendCount: 1,
      });

      // otherUid was the ORIGINAL requester — they're the one who should
      // learn their request was accepted, by the caller's action just now.
      const actorSnapshot = await getActorSnapshot(tx, db, caller.uid);
      await createNotificationInTransaction(tx, db, {
        recipientId: otherUid,
        actorId: caller.uid,
        actorSnapshot,
        type: "friend_request_accepted",
        entityType: "friendship",
        entityId: pairId,
      });

      return { status: "accepted", created: false };
    });
  },
);
