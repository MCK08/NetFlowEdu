import { doc, DocumentData, getDoc, Timestamp } from "firebase/firestore";

import { PublicProfile } from "@/types/publicProfile";
import { db } from "./config";

function toMillis(value: Timestamp | number | null | undefined): number {
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === "number" ? value : 0;
}

function toPublicProfile(uid: string, data: DocumentData): PublicProfile {
  return {
    uid,
    username: data.username ?? null,
    displayName: data.displayName ?? "",
    photoURL: data.photoURL ?? null,
    role: data.role ?? "student",
    organizationId: data.organizationId ?? null,
    totalPoints: data.totalPoints ?? 0,
    weeklyPoints: data.weeklyPoints ?? 0,
    createdAt: toMillis(data.createdAt),
  };
}

// publicProfiles/{uid} is readable by any authenticated user (unlike
// users/{uid}, which stays owner-only — see firestore.rules and
// functions/src/profiles/syncPublicProfile.ts, the only writer). Returns
// null both for "doesn't exist" and for a caller who isn't signed in at
// all (permission-denied) — callers treat both as "profile unavailable".
export async function getPublicProfileOnce(uid: string): Promise<PublicProfile | null> {
  const snapshot = await getDoc(doc(db, "publicProfiles", uid));
  if (!snapshot.exists()) return null;
  return toPublicProfile(uid, snapshot.data());
}
