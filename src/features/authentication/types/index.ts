// The intended role only decides whether a teacherRequests/{uid} document is
// filed after registration (see authService.registerStudent) — the account
// itself is always created as a student. Only adminSetUserRole can ever
// grant the teacher role.
export type IntendedRole = "student" | "teacher";

export interface RegisterInput {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
  intendedRole: IntendedRole;
  organizationName: string;
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
