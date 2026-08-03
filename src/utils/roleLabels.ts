import { UserRole } from "@/types/user";

// The one place the four role names are spelled in Turkish. Previously
// copy-pasted as a local `ROLE_LABELS` map into RoleBadge,
// AccountSwitcherSheet, ProfileScreen and PublicProfileScreen — four maps
// that could drift independently. Pure (no theme/React import) so both the
// RoleBadge component and the pure account-switcher presentation logic can
// share it.
const ROLE_LABELS: Record<UserRole, string> = {
  student: "Öğrenci",
  teacher: "Öğretmen",
  organization_admin: "Kurum Yöneticisi",
  platform_admin: "Platform Yöneticisi",
};

// Unknown values fall back to the raw string rather than throwing or
// showing a blank badge — a role this client doesn't recognize is a real
// possibility after a server-side role is added.
export function roleLabel(role: UserRole | string): string {
  return ROLE_LABELS[role as UserRole] ?? role;
}

export function optionalRoleLabel(role: UserRole | null | undefined): string | null {
  return role ? roleLabel(role) : null;
}
