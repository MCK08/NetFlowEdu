// Assignment is an ORCHESTRATION layer, not a second learning engine — see
// this feature's services for the full reasoning. It never stores
// mastery/interval/scheduling data (that stays exclusively reviewScheduler
// + StudyItem's job); it only records WHICH questions a teacher picked for
// WHICH students, and how many of those a student has since answered
// (any real recordStudyOutcome call, regardless of outcome).

export type AssignmentStatus = "draft" | "published" | "archived";

// Bounds enforced both here (client-side UX) and in firestore.rules
// (server-side, authoritative) — an assignment's questionIds/
// targetStudentIds are a SNAPSHOT taken at creation time, kept small
// enough that neither array can approach Firestore's document-size limit
// even in the worst realistic case (a few dozen short string ids is
// nowhere near 1MB).
export const MAX_ASSIGNMENT_QUESTIONS = 30;
export const MAX_ASSIGNMENT_STUDENTS = 200;
export const MAX_ASSIGNMENT_TITLE_LENGTH = 80;
export const MAX_ASSIGNMENT_DESCRIPTION_LENGTH = 300;

export interface Assignment {
  id: string;
  classId: string;
  organizationId: string | null;
  teacherId: string;
  title: string;
  description: string | null;
  subject: string;
  topic: string;
  gradeLevel: string;
  // A snapshot taken at creation/publish time — a student later removed
  // from the class keeps their access (and their progress); a student who
  // joins afterward is NOT retroactively added. Deliberately simple and
  // predictable rather than derived from live class membership.
  targetStudentIds: string[];
  // A snapshot taken at creation time — deliberately never re-queried or
  // re-filtered afterward. If a question is later deleted, this array
  // still names it (the id just resolves to nothing when read); the
  // assignment's own state is never corrupted by that.
  questionIds: string[];
  // The ACTUAL number of questions selected — may be less than what the
  // teacher originally requested if fewer matching questions existed. This
  // is always questionIds.length, kept as its own field for cheap display
  // without needing the full array everywhere it's read.
  targetCount: number;
  // Epoch ms, same convention as every other timestamp in this codebase
  // (nextReviewAt, createdAt, ...) — never a Date string. null = no
  // deadline. Computed from the teacher's local-day selection at creation
  // time (see assignmentDueDate.ts) — the exact same "device-local day
  // boundary" convention studentPerformance.ts's localDayKey already uses,
  // not a second timezone philosophy.
  dueAt: number | null;
  status: AssignmentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AssignmentSubmission {
  studentId: string;
  // Append-only, idempotent (Firestore arrayUnion on write — see
  // assignmentService.ts). Order is not meaningful; completedCount is
  // always its length, kept alongside as a small denormalized field so a
  // teacher's progress list never has to inspect the array itself.
  completedQuestionIds: string[];
  completedCount: number;
  startedAt: number | null;
  lastCompletedAt: number | null;
  // Set once completedCount first reaches the assignment's targetCount.
  // Informational only — the AUTHORITATIVE "is this student done" check is
  // always completedCount >= targetCount (see assignmentProgress.ts),
  // never this field alone, so it can never itself become a source of
  // drift.
  completedAt: number | null;
}
