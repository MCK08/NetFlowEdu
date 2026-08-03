import { ClassRoom } from "@/types/class";

export interface TeacherDashboardStats {
  classCount: number;
  activeClassCount: number;
  memberCount: number;
}

// Derived ENTIRELY from the ClassRoom[] the teacher home already holds in
// memory (useTeacherClasses' single getTeacherClasses call) — this adds no
// Firestore read, no listener and no second query. If a value cannot be
// computed from that array it is deliberately absent from this type rather
// than faked: question counts, for example, would need a whole new query
// per class, so the dashboard simply does not claim to know them.
export function deriveTeacherDashboardStats(classes: ClassRoom[]): TeacherDashboardStats {
  let activeClassCount = 0;
  let memberCount = 0;

  for (const classRoom of classes) {
    if (classRoom.status === "active") activeClassCount++;
    // memberCount is the denormalized counter maintained by the class
    // Cloud Functions (createClass seeds it at 1 for the teacher's own
    // membership row, joinClassByCode/leaveClass adjust it).
    memberCount += classRoom.memberCount;
  }

  return { classCount: classes.length, activeClassCount, memberCount };
}

// Labelled "üye" (member), never "öğrenci" (student), on purpose: the
// teacher's own membership row is included in every class's memberCount
// (see createClass), so calling this a student total would overcount by
// exactly one per class. Subtracting one per class would be a guess about
// data this screen never actually reads, so the honest, unambiguous label
// is the one that matches the underlying counter.
export const MEMBER_STAT_LABEL = "Üye";

// Time-of-day greeting. Pure clock arithmetic — no stored preference, no
// backend value, `date` injectable so the boundaries are testable without
// mocking the system clock.
export function resolveGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}
