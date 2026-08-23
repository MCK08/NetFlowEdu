import {
  addDoc,
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@services/firebase/config";
import { StudyOutcome } from "@features/study/domain/studyTypes";

import { Assignment, AssignmentStatus, AssignmentSubmission } from "../domain/assignmentTypes";
import { applyAssignmentCompletion } from "./assignmentProgress";

const VALID_OUTCOMES: readonly StudyOutcome[] = ["again", "struggled", "solved"];

function toQuestionOutcomes(value: unknown): Record<string, StudyOutcome> {
  if (value == null || typeof value !== "object") return {};
  const result: Record<string, StudyOutcome> = {};
  for (const [questionId, outcome] of Object.entries(value as Record<string, unknown>)) {
    if (typeof outcome === "string" && (VALID_OUTCOMES as readonly string[]).includes(outcome)) {
      result[questionId] = outcome as StudyOutcome;
    }
  }
  return result;
}

function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

// Phase 44 — defensive exactly like every other field here: a malformed or
// legacy (pre-Phase-44) document must resolve to null, never a fabricated
// subject/topic. Absence is not evidence the assignment ISN'T an
// intervention that predates this field — see interventionEffectiveness.ts's
// selectMostRecentIntervention for how the legacy fallback handles that.
function toInterventionOf(value: unknown): { subject: string; topic: string } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.subject !== "string" || data.subject.length === 0) return null;
  if (typeof data.topic !== "string" || data.topic.length === 0) return null;
  return { subject: data.subject, topic: data.topic };
}

function toAssignment(id: string, data: DocumentData): Assignment {
  return {
    id,
    classId: data.classId ?? "",
    organizationId: data.organizationId ?? null,
    teacherId: data.teacherId ?? "",
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : null,
    subject: typeof data.subject === "string" ? data.subject : "",
    topic: typeof data.topic === "string" ? data.topic : "",
    gradeLevel: typeof data.gradeLevel === "string" ? data.gradeLevel : "",
    targetStudentIds: Array.isArray(data.targetStudentIds) ? data.targetStudentIds : [],
    questionIds: Array.isArray(data.questionIds) ? data.questionIds : [],
    targetCount: typeof data.targetCount === "number" ? data.targetCount : 0,
    dueAt: typeof data.dueAt === "number" ? data.dueAt : null,
    status: data.status === "published" || data.status === "archived" ? data.status : "draft",
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    interventionOf: toInterventionOf(data.interventionOf),
  };
}

function toSubmission(data: DocumentData): AssignmentSubmission {
  return {
    studentId: data.studentId ?? "",
    completedQuestionIds: Array.isArray(data.completedQuestionIds) ? data.completedQuestionIds : [],
    completedCount: typeof data.completedCount === "number" ? data.completedCount : 0,
    startedAt: typeof data.startedAt === "number" ? data.startedAt : null,
    lastCompletedAt: typeof data.lastCompletedAt === "number" ? data.lastCompletedAt : null,
    completedAt: typeof data.completedAt === "number" ? data.completedAt : null,
    questionOutcomes: toQuestionOutcomes(data.questionOutcomes),
  };
}

export interface CreateAssignmentInput {
  classId: string;
  organizationId: string | null;
  teacherId: string;
  title: string;
  description: string | null;
  subject: string;
  topic: string;
  gradeLevel: string;
  targetStudentIds: readonly string[];
  questionIds: readonly string[];
  dueAt: number | null;
  status: AssignmentStatus;
  // Phase 44 — set ONLY by the two explicit Phase 43 intervention CTAs
  // (see assignmentTypes.ts's Assignment.interventionOf doc comment).
  // Omitted (undefined) for every ordinary create call — never defaulted to
  // null here, so a caller that hasn't been updated yet cannot silently
  // write the field at all rather than writing an explicit "not this one".
  interventionOf?: { subject: string; topic: string } | null;
}

export async function createAssignment(input: CreateAssignmentInput): Promise<string> {
  const ref = await addDoc(collection(db, "assignments"), {
    classId: input.classId,
    organizationId: input.organizationId,
    teacherId: input.teacherId,
    title: input.title,
    description: input.description,
    subject: input.subject,
    topic: input.topic,
    gradeLevel: input.gradeLevel,
    targetStudentIds: [...input.targetStudentIds],
    questionIds: [...input.questionIds],
    targetCount: input.questionIds.length,
    dueAt: input.dueAt,
    status: input.status,
    interventionOf: input.interventionOf ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Single-field equality — same provable-query shape as
// getClassQuestionsPage's own classId filter, no composite index needed
// (no orderBy paired with it; callers sort client-side).
export async function getClassAssignments(classId: string): Promise<Assignment[]> {
  const snapshot = await getDocs(query(collection(db, "assignments"), where("classId", "==", classId)));
  return snapshot.docs.map((docSnap) => toAssignment(docSnap.id, docSnap.data()));
}

// array-contains alone (no orderBy paired with it) — same "no composite
// index" reasoning as getClassAssignments above. Spans every class the
// student is in, matching how their Daily Plan already aggregates across
// classes via studyItems.
export async function getStudentAssignments(uid: string): Promise<Assignment[]> {
  const snapshot = await getDocs(
    query(collection(db, "assignments"), where("targetStudentIds", "array-contains", uid)),
  );
  return snapshot.docs.map((docSnap) => toAssignment(docSnap.id, docSnap.data()));
}

export async function getAssignmentById(assignmentId: string): Promise<Assignment | null> {
  const snap = await getDoc(doc(db, "assignments", assignmentId));
  if (!snap.exists()) return null;
  return toAssignment(snap.id, snap.data());
}

// A plain collection read scoped entirely by the fixed assignmentId path
// segment (not a query filter) — same shape as classes/{classId}/members,
// already proven safe for a teacher-only list read.
export async function getAssignmentSubmissions(assignmentId: string): Promise<AssignmentSubmission[]> {
  const snapshot = await getDocs(collection(db, "assignments", assignmentId, "submissions"));
  return snapshot.docs.map((docSnap) => toSubmission(docSnap.data()));
}

export async function getMySubmission(
  assignmentId: string,
  uid: string,
): Promise<AssignmentSubmission | null> {
  const snap = await getDoc(doc(db, "assignments", assignmentId, "submissions", uid));
  if (!snap.exists()) return null;
  return toSubmission(snap.data());
}

// Idempotent — mirrors applyAssignmentCompletion (pure) exactly, inside a
// transaction rather than a plain arrayUnion update so the "set startedAt/
// completedAt only the first time" semantics stay correct even under a
// rapid double-tap or a retried submit. Never touches recordStudyOutcome's
// own data — this is a completely separate document/write.
export async function recordAssignmentProgress(
  assignmentId: string,
  studentId: string,
  questionId: string,
  targetCount: number,
  outcome?: StudyOutcome,
): Promise<AssignmentSubmission> {
  const ref = doc(db, "assignments", assignmentId, "submissions", studentId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const previous = snap.exists() ? toSubmission(snap.data()) : null;
    const next = applyAssignmentCompletion(previous, questionId, targetCount, Date.now(), outcome);
    const withId: AssignmentSubmission = { ...next, studentId };
    tx.set(ref, withId);
    return withId;
  });
}

export async function updateAssignmentStatus(assignmentId: string, status: AssignmentStatus): Promise<void> {
  await updateDoc(doc(db, "assignments", assignmentId), { status, updatedAt: serverTimestamp() });
}
