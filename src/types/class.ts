export type ClassStatus = "active" | "archived";

export interface ClassRoom {
  id: string;
  name: string;
  organizationId: string | null;
  teacherId: string;
  joinCode: string;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  status: ClassStatus;
}

export type ClassMemberRole = "student" | "teacher";

// classes/{classId}/members/{uid} — displayName/username/photoURL are a
// denormalized snapshot taken at join time (same reasoning as
// savedQuestions/publicProfiles: avoid an extra read per member row when
// rendering a list). Older membership rows (written before username was
// added to this snapshot) simply don't have the field — always optional,
// never backfilled; resolvePublicIdentity treats a missing username as
// "no secondary line", not an error.
export interface ClassMember {
  uid: string;
  role: ClassMemberRole;
  joinedAt: number;
  displayName: string;
  username?: string | null;
  photoURL: string | null;
}
