import { TeacherActionCenterItem } from "./teacherActionCenter";

// Phase 101 — where an Action Center row leads, stated once.
//
// The Action Center now appears in two places: embedded at the top of Sınıf
// Performansı, and complete on its own "Bugün Öne Çıkanlar" route. Both render
// the same row component, so WHICH callback a row fires is already shared.
// What each screen then does with it — the student URL, the composer's topic
// — is what could quietly drift between two screens. These helpers are that
// part, pure and unit-tested, so the embedded row and the full-list row cannot
// resolve the same action to different places.

export interface ActionCenterRosterEntry {
  studentUid: string;
  displayName: string;
}

/** Phase 123 — the ONE student destination, for callers that already know the
 *  name (the class roster) as well as those that look it up (the Action
 *  Center). A second spelling of this path is how the roster and the action
 *  row would start opening different screens. */
export function teacherStudentRoute(classId: string, studentUid: string, studentName: string) {
  return {
    pathname: "/(teacher)/class/[classId]/student/[studentId]" as const,
    params: { classId, studentId: studentUid, studentName },
  };
}

/** The student screen, with the same params Sınıf Performansı has always
 *  sent. The name comes from the roster the screen already holds; an unknown
 *  student sends an empty name rather than a guess. */
export function teacherStudentHref(
  classId: string,
  studentUid: string,
  roster: readonly ActionCenterRosterEntry[],
) {
  const entry = roster.find((card) => card.studentUid === studentUid);
  return teacherStudentRoute(classId, studentUid, entry?.displayName ?? "");
}

/** The complete Action Center for one class. */
export function teacherActionCenterHref(classId: string) {
  return {
    pathname: "/(teacher)/class/[classId]/actions" as const,
    params: { classId },
  };
}

export interface ActionCenterComposerContext {
  subject: string;
  topic: string;
  gradeLevel: string | null;
}

/** What "Müdahale Hazırla" prefills the question composer with. Null when the
 *  row carries no topic, in which case nothing opens — exactly what the
 *  embedded section did before this helper existed. gradeLevel is passed
 *  through as-is: Phase 43 made it null whenever the topic's questions do not
 *  agree, and a null must stay a null rather than become a default grade. */
export function actionCenterComposerContext(
  item: TeacherActionCenterItem,
): ActionCenterComposerContext | null {
  if (!item.topicContext) return null;
  return {
    subject: item.topicContext.subject,
    topic: item.topicContext.topic,
    gradeLevel: item.topicContext.gradeLevel,
  };
}
