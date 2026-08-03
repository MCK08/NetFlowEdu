import {
  ForgotPasswordFieldErrors,
  ForgotPasswordInput,
  LoginFieldErrors,
  LoginInput,
  RegisterFieldErrors,
  RegisterInput,
} from "../types";
import { validateRoleSelection } from "../services/rolePresentation";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const PASSWORD_UPPERCASE = /[A-ZÇĞİÖŞÜ]/;
const PASSWORD_LOWERCASE = /[a-zçğıöşü]/;
const PASSWORD_NUMBER = /\d/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// displayName is the public, chosen name shown throughout the app — not
// necessarily a legal name — so it may contain spaces freely ("Sinem
// Hoca", "Matematikçi Burak"). Only length is validated.
export function validateDisplayName(displayName: string): string | undefined {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return "Görünen ad gerekli.";
  }
  if (trimmed.length < 2) {
    return "Görünen ad en az 2 karakter olmalı.";
  }
  if (trimmed.length > 60) {
    return "Görünen ad en fazla 60 karakter olabilir.";
  }
  return undefined;
}

export function validateEmail(email: string): string | undefined {
  const trimmed = normalizeEmail(email);
  if (trimmed.length === 0) {
    return "E-posta adresi gerekli.";
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return "Geçerli bir e-posta adresi girin.";
  }
  return undefined;
}

export interface PasswordRule {
  id: "length" | "uppercase" | "lowercase" | "number";
  // Shown on the register screen BEFORE the person fails it. The rules were
  // previously discoverable only by submitting and reading the error, which
  // is the worst possible time to learn them.
  hint: string;
  // The message shown when this is the first rule violated. Byte-identical
  // to what validatePassword returned before this list existed.
  message: string;
  test: (password: string) => boolean;
}

// One ordered source of truth: the visible checklist and the validation
// error are the same four rules, so they can never disagree. Order is
// load-bearing — validatePassword reports the FIRST failing rule, and that
// order (length, uppercase, lowercase, number) is preserved exactly.
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    hint: "En az 8 karakter",
    message: "Şifre en az 8 karakter olmalı.",
    test: (password) => password.length >= 8,
  },
  {
    id: "uppercase",
    hint: "En az bir büyük harf",
    message: "Şifre en az bir büyük harf içermeli.",
    test: (password) => PASSWORD_UPPERCASE.test(password),
  },
  {
    id: "lowercase",
    hint: "En az bir küçük harf",
    message: "Şifre en az bir küçük harf içermeli.",
    test: (password) => PASSWORD_LOWERCASE.test(password),
  },
  {
    id: "number",
    hint: "En az bir rakam",
    message: "Şifre en az bir rakam içermeli.",
    test: (password) => PASSWORD_NUMBER.test(password),
  },
] as const;

// Which rules a password currently satisfies — drives the live checklist
// without re-implementing a single test. Never used for authorization;
// Firebase Auth enforces its own minimum server-side regardless.
export function evaluatePasswordRules(password: string): { id: PasswordRule["id"]; hint: string; satisfied: boolean }[] {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    hint: rule.hint,
    satisfied: rule.test(password),
  }));
}

export function validatePassword(password: string): string | undefined {
  if (password.length === 0) {
    return "Şifre gerekli.";
  }
  return PASSWORD_RULES.find((rule) => !rule.test(password))?.message;
}

// The username rule stated up front, in the same words the failure message
// uses. USERNAME_PATTERN is the single definition both derive from.
export const USERNAME_HINT = "3-20 karakter · yalnızca harf, rakam ve alt çizgi (_)";

// displayName and username are two different things and the register form
// asks for both back to back — saying so once removes the most common
// "why does it want my name twice?" confusion.
export const DISPLAY_NAME_HINT = "Uygulamada görünecek adın. Boşluk kullanabilirsin.";

export function validatePasswordConfirmation(
  password: string,
  confirmPassword: string,
): string | undefined {
  if (confirmPassword.length === 0) {
    return "Şifre tekrarı gerekli.";
  }
  if (password !== confirmPassword) {
    return "Şifreler eşleşmiyor.";
  }
  return undefined;
}

export function validateUsername(username: string): string | undefined {
  const trimmed = username.trim();
  if (trimmed.length === 0) {
    return "Kullanıcı adı gerekli.";
  }
  if (!USERNAME_PATTERN.test(trimmed)) {
    return "Kullanıcı adı 3-20 karakter olmalı ve yalnızca harf, rakam, alt çizgi (_) içermeli.";
  }
  return undefined;
}

export function validateTermsAccepted(accepted: boolean): string | undefined {
  return accepted ? undefined : "Devam etmek için kullanım koşullarını kabul etmelisiniz.";
}

export function validateRegisterInput(input: RegisterInput): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};

  const displayNameError = validateDisplayName(input.displayName);
  if (displayNameError) errors.displayName = displayNameError;

  const usernameError = validateUsername(input.username);
  if (usernameError) errors.username = usernameError;

  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(input.password);
  if (passwordError) errors.password = passwordError;

  const confirmError = validatePasswordConfirmation(input.password, input.confirmPassword);
  if (confirmError) errors.confirmPassword = confirmError;

  const termsError = validateTermsAccepted(input.acceptedTerms);
  if (termsError) errors.acceptedTerms = termsError;

  // The UI defaults to "student" so this normally never fires — it exists so
  // "no role selected" can never reach initializeOnboarding, which would
  // record a null requestedRole and permanently strand the account at Stage
  // 2 (see authService.registerStudent's own incident comment). Checked in
  // the pure validator rather than relying on a form default that a future
  // screen might not set.
  const roleError = validateRoleSelection(input.intendedRole);
  if (roleError) errors.intendedRole = roleError;

  return errors;
}

export function validateLoginInput(input: LoginInput): LoginFieldErrors {
  const errors: LoginFieldErrors = {};

  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;

  if (input.password.length === 0) {
    errors.password = "Şifre gerekli.";
  }

  return errors;
}

export function validateForgotPasswordInput(
  input: ForgotPasswordInput,
): ForgotPasswordFieldErrors {
  const errors: ForgotPasswordFieldErrors = {};

  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;

  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}
