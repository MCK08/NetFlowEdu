import {
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  updateDoc,
} from "firebase/firestore";

import { UserProfile } from "@/types/user";
import { db } from "./config";

function toMillis(value: Timestamp | number | undefined): number {
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === "number" ? value : 0;
}

function toUserProfile(uid: string, data: DocumentData): UserProfile {
  return {
    uid,
    email: data.email ?? "",
    displayName: data.displayName ?? "",
    username: data.username ?? null,
    role: data.role ?? "student",
    organizationId: data.organizationId ?? null,
    photoURL: data.photoURL ?? null,
    totalPoints: data.totalPoints ?? 0,
    weeklyPoints: data.weeklyPoints ?? 0,
    accountStatus: data.accountStatus ?? "active",
    emailVerified: data.emailVerified ?? false,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

// Subscribes to users/{uid} and invokes `onChange` with the parsed profile,
// or `null` once if the document doesn't exist yet (e.g. the onUserCreate
// trigger hasn't finished running). Returns the unsubscribe function.
export function subscribeToUserProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid),
    (snapshot) => {
      onChange(snapshot.exists() ? toUserProfile(uid, snapshot.data()) : null);
    },
    onError,
  );
}

// One-shot lookup for src/features/profiles' cache — unlike
// subscribeToUserProfile this doesn't keep a live listener open, since the
// cache only needs a point-in-time username/displayName/photoURL for
// rendering someone else's name on a card, not live updates. Returns null
// for "doesn't exist"; a permission-denied FirebaseError propagates to the
// caller, which the profile cache treats the same way (falls back to
// "Kullanıcı", never surfaces the uid) — see
// firestore.rules `users/{userId}`: only the owner can read their own doc,
// so today this only ever actually succeeds for the caller's own uid.
export async function getUserProfileOnce(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  return toUserProfile(uid, snapshot.data());
}

// Only the fields the client is ever allowed to write — matches
// firestore.rules exactly. Anything else must go through Cloud Functions.
export async function updateOwnProfile(
  uid: string,
  fields: Partial<Pick<UserProfile, "displayName" | "photoURL">>,
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}
