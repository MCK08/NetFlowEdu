import { ClassMember } from "@/types/class";

// Phase 83 — lifted out of useClassPerformance unchanged, so the vocabulary
// studio's roster read and Class Performance's cannot disagree about what a
// de-duplicated student list is.
//
// Defensive: classes/{classId}/members is keyed by uid, so a true duplicate
// document is structurally impossible — this only guards against the (still
// possible) case of the same uid appearing twice across paginated/merged reads
// in a future change to getClassMembers.
export function dedupeMembersByUid(members: readonly ClassMember[]): ClassMember[] {
  const seen = new Set<string>();
  const result: ClassMember[] = [];
  for (const member of members) {
    if (seen.has(member.uid)) continue;
    seen.add(member.uid);
    result.push(member);
  }
  return result;
}
