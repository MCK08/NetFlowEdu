import { doc, DocumentData, getDoc } from "firebase/firestore";

import { PublicProfile } from "@/types/publicProfile";
import { db } from "./config";

// Exported so userSearch.ts can map a batch query's docs with the exact
// same logic as this file's own single-doc get — never duplicated.
//
// Reads only the identity fields the projection writes (Phase 112). A
// document written before that phase may still physically contain
// totalPoints/weeklyPoints until it is rewritten or cleaned up; ignoring
// them here means no screen can render them in the meantime.
export function toPublicProfile(uid: string, data: DocumentData): PublicProfile {
  return {
    uid,
    username: data.username ?? null,
    displayName: data.displayName ?? "",
    photoURL: data.photoURL ?? null,
    role: data.role ?? "student",
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
