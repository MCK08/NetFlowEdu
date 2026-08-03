import { memo } from "react";

import { UserRole } from "@/types/user";
import { roleLabel } from "@utils/roleLabels";

import { Badge } from "./Badge";

// The label text itself now lives in utils/roleLabels.ts — a pure module —
// so the account-switcher's presentation logic can share the exact same
// four strings without importing a React component. ProfileScreen.tsx and
// PublicProfileScreen.tsx still carry their own local copies; those screens
// are outside this phase's scope and switching them over is a
// zero-visual-change follow-up.
interface RoleBadgeProps {
  role: UserRole | string;
}

export const RoleBadge = memo(function RoleBadge({ role }: RoleBadgeProps) {
  return <Badge label={roleLabel(role)} variant="primary" />;
});
