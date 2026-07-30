import { memo } from "react";

import { UserRole } from "@/types/user";

import { Badge } from "./Badge";

// Same three role labels currently duplicated inline as a local
// `ROLE_LABELS` map in ProfileScreen.tsx, AccountSwitcherSheet.tsx, and
// PublicProfileScreen.tsx — centralized here so future screens don't add a
// fourth copy. Existing screens are left untouched for this phase (Phase
// 12A is foundation-only); swapping their local map for this component is
// a zero-visual-change follow-up, not done here to avoid touching
// currently-working screens.
const ROLE_LABELS: Record<UserRole, string> = {
  student: "Öğrenci",
  teacher: "Öğretmen",
  organization_admin: "Kurum Yöneticisi",
  platform_admin: "Platform Yöneticisi",
};

interface RoleBadgeProps {
  role: UserRole | string;
}

export const RoleBadge = memo(function RoleBadge({ role }: RoleBadgeProps) {
  const label = ROLE_LABELS[role as UserRole] ?? role;
  return <Badge label={label} variant="primary" />;
});
