import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import {
  ChoiceLabel,
  hasQuestionRevisionConflict,
  newlyReferencedDefinitionIds,
  projectQuestionAuthoringState,
  QuestionAuthoringState,
  questionAuthoringRevision,
  sanitizeQuestionAuthoringState,
} from "./questionRevision";

// Phase 88 — the ONLY way a question's authoring state may change.
//
// WHAT PHASE 87 LEFT OPEN
//
// Phase 87's conflict check lived in a client transaction, so it protected the
// product path and nothing else: an authenticated owner could PATCH the
// document directly and skip the ownership re-check, the staleness check and
// every sanitiser. Phase 87 proved that rather than assuming it. This callable,
// plus the rule that now denies client updates outright, is where that closes.
//
// WHAT IS CHECKED HERE, IN ORDER
//
//   1. authenticated at all
//   2. the payload is shaped like a revision
//   3. the question exists
//   4. the caller IS the owner — not the class teacher, not a member
//   5. the caller's draft is not stale
//   6. any NEW shared definition it points at is real, in this class, in this
//      question's scope, and not archived
//
// Only then are five fields written. Ownership and staleness are separate
// questions and are answered separately: a matching fingerprint grants nothing,
// and being the owner does not make a stale draft safe.
//
// WHAT IT NEVER TOUCHES
//
// studyEvents, studyItems, semanticDefinitions, assignments, counters, or any
// field of the question outside the five. A revision is future-facing: the next
// learner meets the revised question and every recorded outcome stays as it was.

/** How many choice labels a question can carry, and therefore the hard ceiling
 *  on definition reads per call. There is no unbounded fan-out here. */
const MAX_DEFINITION_READS = 5;

interface RevisionRequest {
  questionId?: unknown;
  expectedRevision?: unknown;
  revision?: unknown;
}

/** The marker the client matches on to tell a stale draft apart from a refusal.
 *  Sent in `details` so the human-readable message stays free to change. */
export const REVISION_CONFLICT_REASON = "revision-conflict";

/** The whole contract, with `db` and the caller's uid as parameters.
 *
 *  Exported and separated from the onCall wrapper for exactly the reason
 *  markAllNotificationsReadForUid is: the guarantees here — atomic
 *  compare-and-set, owner enforcement, sanitisation, semantic-scope validation —
 *  depend on real Firestore transaction semantics, so the test that proves them
 *  has to drive this same shipped code against a real emulator rather than a
 *  fake. A passing test here is a passing production path. */
export async function applyQuestionRevision(
  db: Firestore,
  callerUid: string | undefined,
  data: RevisionRequest | undefined,
): Promise<{ revision: string; state: QuestionAuthoringState }> {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  }

  const questionId = data?.questionId;
  if (typeof questionId !== "string" || questionId.length === 0 || questionId.includes("/")) {
    throw new HttpsError("invalid-argument", "Geçersiz soru kimliği.");
  }

  const expectedRevision = data?.expectedRevision;
  if (typeof expectedRevision !== "string" || expectedRevision.length === 0) {
    throw new HttpsError("invalid-argument", "Geçersiz sürüm bilgisi.");
  }

  const rawRevision = data?.revision;
  if (!rawRevision || typeof rawRevision !== "object" || Array.isArray(rawRevision)) {
    throw new HttpsError("invalid-argument", "Geçersiz düzenleme verisi.");
  }

  // Sanitised BEFORE the transaction and never trusted from the client. Only
  // the five named fields are read off the payload, so a forged ownerId,
  // classId, visibility or counter is not rejected so much as never seen.
  const requested = sanitizeQuestionAuthoringState(rawRevision as Record<string, unknown>);
  if (!requested.choices || !requested.correctChoice) {
    throw new HttpsError(
      "invalid-argument",
      "Bir soruda en az iki şık ve işaretlenmiş bir doğru cevap bulunmalı.",
    );
  }

  const questionRef = db.collection("questions").doc(questionId);

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(questionRef);
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Soru bulunamadı.");
    }
    const questionData = snapshot.data() as Record<string, unknown>;

    // Ownership. Deliberately NOT "teaches the class": a class contains
    // questions authored by its students, and owning the classroom is not
    // owning their work.
    if (questionData.ownerId !== callerUid) {
      throw new HttpsError("permission-denied", "Bu soruyu yalnızca yazarı düzenleyebilir.");
    }

    // Staleness, derived from the document as it is at commit time. Inside the
    // transaction so there is no window between the comparison and the write.
    const current = projectQuestionAuthoringState(questionData);
    if (hasQuestionRevisionConflict(expectedRevision, questionAuthoringRevision(questionData))) {
      throw new HttpsError(
        "failed-precondition",
        "Bu soru başka bir oturumda güncellendi.",
        { reason: REVISION_CONFLICT_REASON },
      );
    }

    // Only NEW references are validated. A mapping that is already on the
    // question stays valid even if its definition has since been archived —
    // archiving retires a definition from new selection, it does not
    // invalidate the questions already pointing at it.
    const newIds = newlyReferencedDefinitionIds(current, requested).slice(0, MAX_DEFINITION_READS);
    if (newIds.length > 0) {
      const classId = typeof questionData.classId === "string" ? questionData.classId : null;
      if (!classId) {
        throw new HttpsError(
          "invalid-argument",
          "Ortak etiketler yalnızca sınıf sorularında kullanılabilir.",
        );
      }
      // Every read happens before the write — a Firestore transaction
      // requirement, and the reason these are gathered here rather than lazily.
      const definitions = await Promise.all(
        newIds.map((id) =>
          tx.get(db.collection("classes").doc(classId).collection("semanticDefinitions").doc(id)),
        ),
      );
      for (const definition of definitions) {
        if (!definition.exists) {
          throw new HttpsError("invalid-argument", "Seçilen ortak etiket bulunamadı.");
        }
        const value = definition.data() as Record<string, unknown>;
        if (value.classId !== classId) {
          throw new HttpsError("invalid-argument", "Ortak etiket bu sınıfa ait değil.");
        }
        // Scope is identity for a shared meaning (Phase 80/81): the same
        // definition met in another subject or topic is a different grouping.
        if (value.subject !== questionData.subject || value.topic !== questionData.topic) {
          throw new HttpsError("invalid-argument", "Ortak etiket bu sorunun kapsamına uymuyor.");
        }
        if (value.archived === true) {
          throw new HttpsError("invalid-argument", "Arşivlenmiş bir ortak etiket yeni olarak seçilemez.");
        }
      }
    }

    // Exactly five fields. No spread of the caller's object anywhere in this
    // function, so no forged field can reach the document.
    tx.update(questionRef, {
      description: requested.description,
      choices: requested.choices,
      correctChoice: requested.correctChoice as ChoiceLabel,
      choiceFeedback: requested.choiceFeedback,
      hints: requested.hints,
    });
  });

  const updated = await questionRef.get();
  const stored = (updated.data() ?? {}) as Record<string, unknown>;
  // The canonical result the client re-seeds its draft and fingerprint from,
  // so a second edit in the same sitting is measured against what was written.
  return { revision: questionAuthoringRevision(stored), state: projectQuestionAuthoringState(stored) };
}

export const updateQuestionRevision = onCall<RevisionRequest>((request) =>
  applyQuestionRevision(getFirestore(), request.auth?.uid, request.data),
);
