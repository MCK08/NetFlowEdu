export type UserRole = "student" | "teacher" | "organization_admin" | "platform_admin";

export interface UserClaims {
  role: UserRole;
  organizationId: string | null;
}

export const PROMOTABLE_ROLES: readonly UserRole[] = [
  "student",
  "teacher",
  "organization_admin",
] as const;

export const ROLES_ALLOWED_TO_PROMOTE: readonly UserRole[] = [
  "organization_admin",
  "platform_admin",
] as const;
