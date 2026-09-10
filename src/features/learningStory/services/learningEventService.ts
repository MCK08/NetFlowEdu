import { collection, DocumentData, getDocs, limit, orderBy, query, where } from "firebase/firestore";

import { StudyOutcome } from "@features/study/domain/studyTypes";
import { db } from "@services/firebase/config";
import { CHOICE_LABELS, ChoiceLabel } from "@/types/question";

import type {
  SemanticIdentity,
  SemanticNamespaceKind,
  StoredSemanticChoice,
  StoredSemanticOpportunities,
} from "./learningTrail";

// Phase 59 — reading the chronological learning history.
//
// Both queries below are BOUNDED and ordered by the server-written
// `occurredAt`. Neither loads a lifetime of history and slices client-side;
// the limit is part of the query, so the read cost is fixed regardless of how
// long a student has used the app.

// How many recent events one screen may read. Large enough that several
// topics can each contribute a full trail, small enough to stay one cheap
// query. The trail itself shows at most MAX_TRAIL_EVENTS per topic.
export const MAX_RECENT_EVENTS = 40;

// The raw document, before subject/topic are joined in from the metadata
// cache. Deliberately mirrors the server record exactly — the event carries
// no question content of its own (see functions/src/study/learningEvent.ts).
export interface StoredLearningEvent {
  id: string;
  questionId: string;
  outcome: StudyOutcome;
  occurredAt: number;
  sourceClassId: string | null;
  // Phase 79 — absent on every pre-Phase-79 event and on every outcome
  // recorded without an actual pick.
  semanticOpportunities: StoredSemanticOpportunities | null;
  // Absent on every pre-Phase-78 event and on every outcome that carried no
  // authored distractor meaning — which is most of them. Absence means "no
  // authored semantic meaning was recorded", never "nothing happened".
  semanticChoice: StoredSemanticChoice | null;
}

function isOutcome(value: unknown): value is StudyOutcome {
  return value === "solved" || value === "struggled" || value === "again";
}

// All-or-nothing: a payload missing any component is dropped entirely rather
// than partially kept. A conceptKey without its namespace is not a weaker
// identity, it is a different and unsafe one — it would let two authors'
// vocabularies merge, which is the single thing this evidence model exists to
// prevent.
// Phase 80 — a missing kind means "author".
//
// That default is the entire backward-compatibility story for Phase 78 and 79
// events: they were all author-scoped, they simply had no field saying so, and
// reading their silence as anything else would retroactively turn one person's
// private vocabulary into a shared one. Only an explicit "class" is shared.
function toNamespaceKind(value: unknown): SemanticNamespaceKind {
  return value === "class" ? "class" : "author";
}

function toIdentity(namespaceKind: unknown, namespaceId: unknown, semanticId: unknown): SemanticIdentity | null {
  const id = typeof namespaceId === "string" ? namespaceId.trim() : "";
  const semantic = typeof semanticId === "string" ? semanticId.trim() : "";
  if (!id || !semantic) return null;
  return { namespaceKind: toNamespaceKind(namespaceKind), namespaceId: id, semanticId: semantic };
}

function toSemanticChoice(value: unknown): StoredSemanticChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // `conceptKey` keeps its Phase 78 field name and now holds either a typed
  // key or an opaque definition id, decided by the kind beside it.
  const identity = toIdentity(record.namespaceKind, record.namespaceId, record.conceptKey);
  if (!identity) return null;
  const choiceLabel = record.choiceLabel;
  if (typeof choiceLabel !== "string") return null;
  if (!(CHOICE_LABELS as readonly string[]).includes(choiceLabel)) return null;

  const rawLabel = typeof record.label === "string" ? record.label.trim() : "";
  return {
    identity,
    choiceLabel: choiceLabel as ChoiceLabel,
    // A label only ever means anything for a shared identity. Refusing it for
    // an author-scoped one stops a stray field from putting invented prose in
    // front of a student.
    label: identity.namespaceKind === "class" && rawLabel ? rawLabel : null,
  };
}

// Skips any document that cannot be read as a real event rather than
// coercing it — a malformed row must never become a fabricated outcome.
function toEvent(id: string, data: DocumentData): StoredLearningEvent | null {
  const questionId = typeof data.questionId === "string" ? data.questionId : null;
  const occurredAt = typeof data.occurredAt === "number" ? data.occurredAt : null;
  if (!questionId || occurredAt === null || !isOutcome(data.outcome)) return null;
  return {
    id,
    questionId,
    outcome: data.outcome,
    occurredAt,
    sourceClassId: typeof data.sourceClassId === "string" ? data.sourceClassId : null,
    semanticChoice: toSemanticChoice(data.semanticChoice),
    semanticOpportunities: toSemanticOpportunities(data.semanticOpportunities),
  };
}

// All-or-nothing, exactly like the selected payload above, and with one extra
// requirement: `selectedChoice` must be present and real. Without it the record
// cannot show that a DECISION was made, and an opportunity nobody was asked to
// decide on is not an opportunity — see the type's own note.
function toSemanticOpportunities(value: unknown): StoredSemanticOpportunities | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const selectedChoice = record.selectedChoice;
  if (typeof selectedChoice !== "string") return null;
  if (!(CHOICE_LABELS as readonly string[]).includes(selectedChoice)) return null;

  const items: SemanticIdentity[] = [];
  const seen = new Set<string>();
  const push = (identity: SemanticIdentity | null) => {
    if (!identity) return;
    const key = `${identity.namespaceKind}\u0000${identity.namespaceId}\u0000${identity.semanticId}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(identity);
  };

  // Phase 80 shape first.
  if (Array.isArray(record.items)) {
    for (const raw of record.items) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      push(toIdentity(entry.namespaceKind, entry.namespaceId, entry.semanticId));
    }
  }

  // Phase 79 shape, read exactly as it was written: one namespace, a flat list
  // of keys, all author-scoped. No backfill and no rewriting — an old document
  // simply describes itself, and this turns it into the same shape everything
  // downstream now compares.
  if (items.length === 0 && Array.isArray(record.conceptKeys)) {
    for (const key of record.conceptKeys) {
      push(toIdentity("author", record.namespaceId, key));
    }
  }

  if (items.length === 0) return null;
  return { items, selectedChoice: selectedChoice as ChoiceLabel };
}

// A student's own recent learning events. Owner-read, exactly what
// firestore.rules' studyEvents rule grants without any teacher branch.
export async function getRecentLearningEvents(
  uid: string,
  max: number = MAX_RECENT_EVENTS,
): Promise<StoredLearningEvent[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "users", uid, "studyEvents"),
      orderBy("occurredAt", "desc"),
      limit(max),
    ),
  );
  return snapshot.docs
    .map((d) => toEvent(d.id, d.data()))
    .filter((event): event is StoredLearningEvent => event !== null);
}

// One student's recent events WITHIN one class, for the teacher's on-demand
// student detail view.
//
// The `sourceClassId` equality filter is not a convenience — it is what makes
// the read provable under the rules (which resolve
// `resource.data.sourceClassId` to check the caller teaches that class), and
// it is also what scopes the teacher to their own classroom rather than a
// student's whole study life. The composite index for
// (sourceClassId ASC, occurredAt DESC) is declared in firestore.indexes.json.
export async function getRecentClassLearningEvents(
  studentUid: string,
  classId: string,
  max: number = MAX_RECENT_EVENTS,
): Promise<StoredLearningEvent[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "users", studentUid, "studyEvents"),
      where("sourceClassId", "==", classId),
      orderBy("occurredAt", "desc"),
      limit(max),
    ),
  );
  return snapshot.docs
    .map((d) => toEvent(d.id, d.data()))
    .filter((event): event is StoredLearningEvent => event !== null);
}
