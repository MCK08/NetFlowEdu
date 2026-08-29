// Phase 53 — the Daily Flow presentation contract.
//
// One small, presentation-friendly model shared by both roles. Nothing in
// here is a Firestore document shape: the composers below translate the
// existing domain outputs (Phase 39/41/42/43/44/47 engines) into ACTIONS,
// and the UI renders only this.
//
// WHY A SEPARATE MODEL AT ALL
//
// The domain types carry evidence a student must never read
// ("persistent_struggle", "struggledCount: 8", confidence buckets). Keeping
// a translation boundary here is what stops classifier jargon leaking into
// user-facing copy (§13/§23), and what lets the composers be tested as pure
// functions with no React and no Firebase.

// Every kind maps to exactly one existing destination — see `DailyFlowTarget`.
export type DailyFlowKind =
  // Student
  | "assignment"
  | "due_review"
  | "reinforce_topic"
  | "practice"
  // Teacher
  | "student_signal"
  | "topic_hotspot";

// Targets are EXISTING routes only. Phase 53 adds no route and no screen.
export type DailyFlowTarget =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "review_session" }
  | { kind: "adaptive_session" }
  | { kind: "question"; questionId: string }
  | { kind: "student_performance"; classId: string; studentUid: string }
  | { kind: "assignment_composer"; classId: string; subject: string; topic: string; gradeLevel: string | null };

export interface DailyFlowItem {
  // Stable across recomputations of the same underlying evidence, so React
  // keys never thrash and a re-render cannot reorder identical content.
  id: string;
  kind: DailyFlowKind;
  title: string;
  // One short, evidence-backed line. Omitted rather than padded when there
  // is nothing true and useful to say (§23/§24).
  reason?: string;
  // The button label. Always a real action, never "Learn more".
  actionLabel: string;
  target: DailyFlowTarget;
  // Lower sorts first. Assigned by the composer from the documented
  // priority ladder — never a score, never tunable, never displayed.
  priority: number;
  // Whether this row represents a state needing attention rather than
  // ordinary progress. Drives the accent treatment; deliberately NOT a
  // "danger" flag and never rendered as an alert badge (§50).
  isAttention?: boolean;
}

// §7 — Daily Flow stays an orientation layer, not a dashboard. Three is the
// ceiling, and fewer is normal and correct.
export const MAX_DAILY_FLOW_ITEMS = 3;
