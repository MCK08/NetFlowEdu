import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";

import { PublicProfile } from "@/types/publicProfile";
import { db } from "./config";
import { toPublicProfile } from "./publicProfile";

const MAX_RESULTS = 20;
const ELIGIBLE_ROLES = ["student", "teacher"] as const;
// Firestore's standard prefix-range trick: "" is a very
// high-codepoint private-use character that sorts after any realistic
// username, so [prefix, prefix + "") captures every string that
// starts with prefix.
const PREFIX_UPPER_BOUND_SUFFIX = "";

// "Arkadaş Bul" search — a bounded, server-side prefix query against
// publicProfiles' own `username` field (already lowercase-normalized by
// setUsername.ts), never a full-collection download with client-side
// filtering. Suspended accounts never appear here at all: syncPublicProfile
// DELETES publicProfiles/{uid} outright on suspension, so every doc this
// query can ever return already implies an active account — no separate
// accountStatus filter is needed or possible (that field intentionally
// never leaves users/{uid}).
export async function searchActiveUsersByUsername(
  prefix: string,
  excludeUid: string,
): Promise<PublicProfile[]> {
  const normalized = prefix.trim().toLowerCase();
  if (!normalized) return [];

  const q = query(
    collection(db, "publicProfiles"),
    where("role", "in", ELIGIBLE_ROLES),
    where("username", ">=", normalized),
    where("username", "<", normalized + PREFIX_UPPER_BOUND_SUFFIX),
    orderBy("username"),
    limit(MAX_RESULTS),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => toPublicProfile(d.id, d.data()))
    .filter((profile) => profile.uid !== excludeUid);
}
