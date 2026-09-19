import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@services/firebase/config";

import { ClassPulse, classPulseWeekKey, parseClassPulse } from "./classSocial";

// Phase 110 — the class social layer's reads and its one write.
//
// Every read is bounded and single-shot: one document for the week's pulse,
// one bounded query for the caller's OWN sent kudos in this class. The member
// roster comes from the existing getClassMembers; the activity is derived from
// data the class screen already holds. Nothing here reads another student's
// private data, and nothing could — see firestore.rules.

export const SENT_KUDOS_LIMIT = 200;

export async function getClassPulse(classId: string, now: number): Promise<ClassPulse | null> {
  const snapshot = await getDoc(doc(db, "classes", classId, "pulse", classPulseWeekKey(now)));
  return snapshot.exists() ? parseClassPulse(snapshot.data()) : null;
}

/** Which questions in this class the caller has already congratulated — read
 *  from their OWN record only, so the button can say "Tebrik edildi". */
export async function getCongratulatedQuestionIds(uid: string, classId: string): Promise<Set<string>> {
  const snapshot = await getDocs(
    query(collection(db, "users", uid, "sentKudos"), where("classId", "==", classId), limit(SENT_KUDOS_LIMIT)),
  );
  const ids = new Set<string>();
  for (const entry of snapshot.docs) {
    const targetId = entry.data().targetId;
    if (typeof targetId === "string" && targetId) ids.add(targetId);
  }
  return ids;
}

export type SendClassKudosStatus = "sent" | "already_sent";

/** "Tebrik Et". Sender and recipient are decided by the server, never sent. */
export async function sendClassKudos(classId: string, questionId: string): Promise<SendClassKudosStatus> {
  const callable = httpsCallable<{ classId: string; questionId: string }, { status: SendClassKudosStatus }>(
    functions,
    "sendClassKudos",
  );
  const result = await callable({ classId, questionId });
  return result.data.status;
}
