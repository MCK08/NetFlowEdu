export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
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
