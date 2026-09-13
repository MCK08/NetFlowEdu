import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Firestore, Transaction } from "firebase-admin/firestore";

import { CHOICE_LABELS, referencedDefinitionIds } from "./questionRevision";
import {
  buildQuestionCreateDraft,
  createdQuestionId,
  isValidOperationId,
  QuestionPosterRole,
  QuestionVisibility,
} from "./questionCreate";

// Phase 89 — the ONLY way a question may come into existence.
//
// WHAT THE AUDIT ACTUALLY FOUND
//
// Phase 89 began by probing the live create rule with real tokens instead of
// reading it and assuming. The result reshaped the phase honestly:
//
//   ALREADY SAFE (firestore.rules, before this phase)
//     ownerId could not be forged — the rule pins it to the caller.
//     posterRole could not be forged — checked against real class membership.
//     The three counters had to be zero.
//     An outsider could not create into a class.
//
//   FORGEABLE (proven, 14 distinct ways)
//     createdAt in the year 2099. A correctChoice naming an option the question
//     does not have. A one-option "multiple choice". A 1000-character hint.
//     An imageUrl on an external host. Arbitrary extra fields. And a semantic
//     mapping to a definition that is archived, from another class, from
//     another subject/topic, or simply invented — with a label to match.
//
// So this callable is not about impersonation. It is about the difference
// between a question document and a COHERENT question: one whose correct answer
// is among its options, whose shared meanings exist and are allowed to be used
// here, and whose image belongs to the person who claims to have taken it.
//
// WHAT THE SERVER OWNS OUTRIGHT
//
// ownerId, createdAt, the three counters, posterRole, visibility,
// organizationId, and every semanticLabel. None is read from the payload.
//
// WHAT IT NEVER TOUCHES
//
// studyEvents, studyItems, semanticDefinitions, classes, assignments. Creating
// a question writes exactly one document.

/** At most one shared definition per choice label, so at most five reads. */
const MAX_DEFINITION_READS = 5;

interface CreateRequest {
  operationId?: unknown;
  surface?: unknown;
  classId?: unknown;
  imageUrl?: unknown;
  subject?: unknown;
  topic?: unknown;
  gradeLevel?: unknown;
  description?: unknown;
  choices?: unknown;
  correctChoice?: unknown;
  choiceFeedback?: unknown;
  hints?: unknown;
}

/** The caller's verified ID-token claims. Typed as a plain record because
 *  that is what it is — a bag of verified values, of which this callable reads
 *  exactly two, and never one the caller could set for themselves. */
type CallerClaims = Record<string, unknown>;

export interface CreateQuestionResult {
  questionId: string;
  /** True when this call did the creating, false when it recognised a retry of
   *  a submission that had already landed. The client treats both as success —
   *  the distinction exists so tests can prove the retry did not write. */
  created: boolean;
}

/** Where a question is being posted from. The client names the surface; the
 *  server decides what that means for visibility and classId, so visibility is
 *  never a client-supplied value. */
function resolveSurface(raw: unknown): QuestionVisibility {
  if (raw === "class" || raw === "private" || raw === "public") return raw;
  throw new HttpsError("invalid-argument", "Geçersiz paylaşım alanı.");
}

/** The whole contract, with `db` and the caller as parameters — the same shape
 *  markAllNotificationsReadForUid and applyQuestionRevision use, so the tests
 *  that prove atomicity and authorization drive this exact shipped code against
 *  a real emulator rather than a fake. */
export async function applyQuestionCreate(
  db: Firestore,
  callerUid: string | undefined,
  claims: CallerClaims | undefined,
  data: CreateRequest | undefined,
): Promise<CreateQuestionResult> {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Soru paylaşmak için giriş yapmanız gerekiyor.");
  }

  const operationId = data?.operationId;
  if (!isValidOperationId(operationId)) {
    throw new HttpsError("invalid-argument", "Geçersiz gönderim kimliği.");
  }

  const visibility = resolveSurface(data?.surface);

  let classId: string | null = null;
  if (visibility === "class") {
    const raw = data?.classId;
    if (typeof raw !== "string" || raw.length === 0 || raw.includes("/")) {
      throw new HttpsError("invalid-argument", "Geçersiz sınıf kimliği.");
    }
    classId = raw;
  }

  const built = buildQuestionCreateDraft(
    (data ?? {}) as Record<string, unknown>,
    callerUid,
    visibility,
    classId,
  );
  if ("rejection" in built) {
    throw new HttpsError("invalid-argument", rejectionMessage(built.rejection));
  }
  const { scope, authoring, imageUrl } = built.draft;

  const questionRef = db.collection("questions").doc(createdQuestionId(callerUid, operationId));

  return db.runTransaction(async (tx) => {
    // EVERY READ FIRST — a Firestore transaction requirement, and the reason
    // the class, the existing document and the definitions are all gathered
    // before anything is written.
    const existing = await tx.get(questionRef);
    if (existing.exists) {
      // The same submission, retried. It is not an error and it must not
      // create a second question. The id is derived from the caller's own uid,
      // so this document is necessarily theirs.
      return { questionId: questionRef.id, created: false };
    }

    const { posterRole, organizationId } = await resolveAuthorStanding(
      db, tx, callerUid, claims, visibility, classId,
    );

    // Every shared mapping on a NEW question is new by definition — there is no
    // pre-existing mapping to grandfather in, which is why (unlike revision)
    // an archived definition is refused outright here.
    const definitionIds = referencedDefinitionIds(authoring).slice(0, MAX_DEFINITION_READS);
    if (definitionIds.length > 0) {
      if (!classId) {
        throw new HttpsError("invalid-argument", "Ortak etiketler yalnızca sınıf sorularında kullanılabilir.");
      }
      const labels = await readValidatedDefinitionLabels(
        db, tx, classId, definitionIds, scope.subject, scope.topic,
      );
      // The label is a display snapshot of a meaning the class owns; the id is
      // the identity. Taking the label from the definition rather than the
      // payload is what stops a question from displaying a name the class
      // never gave it — which the audit proved was accepted before.
      for (const label of CHOICE_LABELS) {
        const entry = authoring.choiceFeedback?.[label];
        if (entry?.semanticDefinitionId) {
          entry.semanticLabel = labels.get(entry.semanticDefinitionId) ?? null;
        }
      }
    }

    tx.set(questionRef, {
      // Server-owned identity. Not one of these is read from the payload.
      ownerId: callerUid,
      posterRole,
      visibility,
      classId,
      organizationId,
      createdAt: FieldValue.serverTimestamp(),
      likeCount: 0,
      commentCount: 0,
      answerCount: 0,
      // Validated scope and content.
      subject: scope.subject,
      topic: scope.topic,
      gradeLevel: scope.gradeLevel,
      imageUrl,
      description: authoring.description,
      choices: authoring.choices,
      correctChoice: authoring.correctChoice,
      choiceFeedback: authoring.choiceFeedback,
      hints: authoring.hints,
    });

    return { questionId: questionRef.id, created: true };
  });
}

/** The labels of every referenced definition, after proving each one may be
 *  used on this question at all. */
async function readValidatedDefinitionLabels(
  db: Firestore,
  tx: Transaction,
  classId: string,
  definitionIds: string[],
  subject: string,
  topic: string,
): Promise<Map<string, string | null>> {
  const snapshots = await Promise.all(
    definitionIds.map((id) =>
      tx.get(db.collection("classes").doc(classId).collection("semanticDefinitions").doc(id)),
    ),
  );
  const labels = new Map<string, string | null>();
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      throw new HttpsError("invalid-argument", "Seçilen ortak etiket bulunamadı.");
    }
    const value = snapshot.data() as Record<string, unknown>;
    if (value.classId !== classId) {
      throw new HttpsError("invalid-argument", "Ortak etiket bu sınıfa ait değil.");
    }
    // Scope is identity for a shared meaning (Phase 80/81): the same definition
    // met in another subject or topic is a different grouping.
    if (value.subject !== subject || value.topic !== topic) {
      throw new HttpsError("invalid-argument", "Ortak etiket bu sorunun kapsamına uymuyor.");
    }
    if (value.archived === true) {
      throw new HttpsError("invalid-argument", "Arşivlenmiş bir ortak etiket yeni soruda kullanılamaz.");
    }
    labels.set(snapshot.id, typeof value.label === "string" ? value.label : null);
  }
  return labels;
}

/** Who the author is allowed to be on this surface, decided from authoritative
 *  records rather than from anything the caller sent. */
async function resolveAuthorStanding(
  db: Firestore,
  tx: Transaction,
  uid: string,
  claims: CallerClaims | undefined,
  visibility: QuestionVisibility,
  classId: string | null,
): Promise<{ posterRole: QuestionPosterRole; organizationId: string | null }> {
  if (visibility !== "class") {
    // A private or public question is filed under the caller's own
    // organisation claim, exactly as the rule required before — students
    // legitimately have none, so null is a real value here, not a gap.
    const org = typeof claims?.organizationId === "string" ? claims.organizationId : null;
    return { posterRole: claims?.role === "teacher" ? "teacher" : "student", organizationId: org };
  }

  const classSnapshot = await tx.get(db.collection("classes").doc(classId as string));
  if (!classSnapshot.exists) {
    throw new HttpsError("not-found", "Sınıf bulunamadı.");
  }
  const classData = classSnapshot.data() as Record<string, unknown>;
  const organizationId = typeof classData.organizationId === "string" ? classData.organizationId : null;

  // The class's own teacher. Read from the class document, never from a claim
  // the caller could hold while teaching a different class.
  if (classData.teacherId === uid) {
    return { posterRole: "teacher", organizationId };
  }

  // Otherwise the caller must be a genuine student member of THIS class. The
  // membership record is the authority on that, which is what makes a
  // posterRole of "teacher" unreachable by payload.
  const member = await tx.get(
    db.collection("classes").doc(classId as string).collection("members").doc(uid),
  );
  if (!member.exists || (member.data() as Record<string, unknown>).role !== "student") {
    throw new HttpsError("permission-denied", "Bu sınıfa soru ekleme yetkiniz yok.");
  }
  return { posterRole: "student", organizationId };
}

function rejectionMessage(rejection: string): string {
  switch (rejection) {
    case "invalid-scope":
      return "Ders, konu veya sınıf seviyesi geçersiz.";
    case "invalid-image":
      return "Soru görseli doğrulanamadı.";
    default:
      return "Bir soruda en az iki şık ve işaretlenmiş bir doğru cevap bulunmalı.";
  }
}

export const createQuestion = onCall<CreateRequest>((request) =>
  applyQuestionCreate(getFirestore(), request.auth?.uid, request.auth?.token, request.data),
);
