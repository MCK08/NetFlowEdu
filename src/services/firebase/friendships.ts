import {
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { EMPTY_SOCIAL_META, Friendship, SocialMetaSummary } from "@/types/friendship";
import { buildFriendshipPairId } from "@features/friends/services/friendshipPairId";
import { db } from "./config";

function toMillis(value: Timestamp | number | null | undefined): number {
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === "number" ? value : 0;
}

function toFriendship(id: string, data: DocumentData): Friendship {
  const participantIds = Array.isArray(data.participantIds) ? data.participantIds : ["", ""];
  return {
    id,
    participantIds: [participantIds[0] ?? "", participantIds[1] ?? ""],
    requesterId: data.requesterId ?? "",
    recipientId: data.recipientId ?? "",
    status: data.status === "accepted" ? "accepted" : "pending",
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    acceptedAt: data.acceptedAt ? toMillis(data.acceptedAt) : null,
    schemaVersion: data.schemaVersion ?? 1,
  };
}

// The relationship (if any) between the caller and one other user — used by
// PublicProfileScreen to resolve which friendship button state to show.
// firestore.rules only allows a participant to read their own friendship
// doc, matching exactly the two uids this computes the pairId from.
export async function getFriendshipBetween(
  ownUid: string,
  otherUid: string,
): Promise<Friendship | null> {
  const pairId = buildFriendshipPairId(ownUid, otherUid);
  const snapshot = await getDoc(doc(db, "friendships", pairId));
  if (!snapshot.exists()) return null;
  return toFriendship(snapshot.id, snapshot.data());
}

export interface FriendshipPage {
  items: Friendship[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

function toPage(docs: QueryDocumentSnapshot<DocumentData>[], pageSize: number): FriendshipPage {
  return {
    items: docs.map((d) => toFriendship(d.id, d.data())),
    cursor: docs.length > 0 ? (docs[docs.length - 1] as QueryDocumentSnapshot<DocumentData>) : null,
    hasMore: docs.length === pageSize,
  };
}

// Accepted friendships the caller is a participant in, newest-updated
// first. Matches firestore.rules (`uid() in resource.data.participantIds`)
// and the participantIds(array-contains)+status+updatedAt composite index.
export async function getFriendsPage(
  uid: string,
  pageSize: number,
  cursor: DocumentSnapshot<DocumentData> | null,
): Promise<FriendshipPage> {
  const constraints = [
    where("participantIds", "array-contains", uid),
    where("status", "==", "accepted"),
    orderBy("updatedAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(query(collection(db, "friendships"), ...constraints));
  return toPage(snapshot.docs, pageSize);
}

// Pending requests where the caller is the recipient ("Gelen İstekler").
export async function getIncomingRequestsPage(
  uid: string,
  pageSize: number,
  cursor: DocumentSnapshot<DocumentData> | null,
): Promise<FriendshipPage> {
  const constraints = [
    where("recipientId", "==", uid),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(query(collection(db, "friendships"), ...constraints));
  return toPage(snapshot.docs, pageSize);
}

// Pending requests where the caller is the requester ("Gönderilen İstekler").
export async function getOutgoingRequestsPage(
  uid: string,
  pageSize: number,
  cursor: DocumentSnapshot<DocumentData> | null,
): Promise<FriendshipPage> {
  const constraints = [
    where("requesterId", "==", uid),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(query(collection(db, "friendships"), ...constraints));
  return toPage(snapshot.docs, pageSize);
}

function toSocialMeta(data: DocumentData | undefined): SocialMetaSummary {
  if (!data) return EMPTY_SOCIAL_META;
  return {
    friendCount: data.friendCount ?? 0,
    incomingRequestCount: data.incomingRequestCount ?? 0,
    outgoingRequestCount: data.outgoingRequestCount ?? 0,
    updatedAt: toMillis(data.updatedAt),
  };
}

// Live listener on the caller's OWN users/{uid}/socialMeta/summary — the
// single small realtime window this phase uses (spec: "realtime yalnızca
// gerekli küçük pencere için"). A user with no summary doc yet (pre-Phase-10
// account, or simply no friendship activity) safely resolves to
// EMPTY_SOCIAL_META rather than an error — see readMeta's own comment
// server-side.
export function subscribeToOwnSocialMeta(
  uid: string,
  onChange: (summary: SocialMetaSummary) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid, "socialMeta", "summary"),
    (snapshot) => onChange(toSocialMeta(snapshot.exists() ? snapshot.data() : undefined)),
    () => onChange(EMPTY_SOCIAL_META),
  );
}
