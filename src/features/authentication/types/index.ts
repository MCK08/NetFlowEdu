// The role the user picks at registration is finalized server-side by the
// completeOnboarding callable (see authService.registerStudent) — "teacher"
// gets promoted immediately, with a personal organization created for them,
// no admin approval step. Only completeOnboarding (once, ever, per account)
// and adminSetUserRole (later, admin-only) can change a user's role.
export type IntendedRole = "student" | "teacher";

export interface RegisterInput {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
  intendedRole: IntendedRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export type RegisterFieldErrors = Partial<Record<keyof RegisterInput, string>>;
export type LoginFieldErrors = Partial<Record<keyof LoginInput, string>>;
export type ForgotPasswordFieldErrors = Partial<Record<keyof ForgotPasswordInput, string>>;
