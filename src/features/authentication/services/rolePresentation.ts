import { IntendedRole } from "../types";

// The two roles a person can actually ASK for at sign-up. Deliberately not
// derived from UserRole: organization_admin/platform_admin exist as real
// roles but are only ever granted by adminSetUserRole, never requested from
// this UI, so offering them here would be inventing a capability.
export interface RoleOption {
  value: IntendedRole;
  title: string;
  // What this account type actually does in THIS app today. No organization
  // promises, no "approval" language, nothing the backend doesn't deliver.
  description: string;
  accessibilityLabel: string;
}

export const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    value: "student",
    title: "Öğrenciyim",
    description: "Soru paylaş, çözümleri incele ve sınıflarına katıl.",
    accessibilityLabel: "Öğrenci hesabı. Soru paylaş, çözümleri incele ve sınıflarına katıl.",
  },
  {
    value: "teacher",
    title: "Öğretmenim",
    description: "Kendi sınıflarını oluştur ve öğrencilerinin sorularını takip et.",
    accessibilityLabel:
      "Öğretmen hesabı. Kendi sınıflarını oluştur ve öğrencilerinin sorularını takip et.",
  },
] as const;

// Shown under the role cards. The wording matters: picking a card here is a
// REQUEST recorded as requestedRole (initializeOnboarding), and the actual
// role/claims grant only ever happens server-side in completeOnboarding
// after email verification. The UI must never read as if tapping a card
// granted anything — see SECURITY.md's "UI role selection is not trusted
// authorization".
export const ROLE_SELECTION_NOTE =
  "Seçimin kaydını tamamladıktan sonra sunucu tarafından uygulanır.";

export const ROLE_SELECTION_MISSING_MESSAGE = "Devam etmek için bir hesap türü seç.";

// A role is only valid if it is one of the two the server actually accepts.
// Guards against an empty/undefined selection reaching initializeOnboarding.
export function isSelectableRole(value: unknown): value is IntendedRole {
  return ROLE_OPTIONS.some((option) => option.value === value);
}

export function validateRoleSelection(value: unknown): string | undefined {
  return isSelectableRole(value) ? undefined : ROLE_SELECTION_MISSING_MESSAGE;
}
