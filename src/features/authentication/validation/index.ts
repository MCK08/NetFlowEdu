import {
  ForgotPasswordFieldErrors,
  ForgotPasswordInput,
  LoginFieldErrors,
  LoginInput,
  RegisterFieldErrors,
  RegisterInput,
} from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_UPPERCASE = /[A-ZÇĞİÖŞÜ]/;
const PASSWORD_LOWERCASE = /[a-zçğıöşü]/;
const PASSWORD_NUMBER = /\d/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateDisplayName(displayName: string): string | undefined {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return "Ad soyad gerekli.";
  }
  if (trimmed.length < 2) {
    return "Ad soyad en az 2 karakter olmalı.";
  }
  if (trimmed.length > 60) {
    return "Ad soyad en fazla 60 karakter olabilir.";
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

export function validatePassword(password: string): string | undefined {
  if (password.length === 0) {
    return "Şifre gerekli.";
  }
  if (password.length < 8) {
    return "Şifre en az 8 karakter olmalı.";
  }
  if (!PASSWORD_UPPERCASE.test(password)) {
    return "Şifre en az bir büyük harf içermeli.";
  }
  if (!PASSWORD_LOWERCASE.test(password)) {
    return "Şifre en az bir küçük harf içermeli.";
  }
  if (!PASSWORD_NUMBER.test(password)) {
    return "Şifre en az bir rakam içermeli.";
  }
  return undefined;
}

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

export function validateTermsAccepted(accepted: boolean): string | undefined {
  return accepted ? undefined : "Devam etmek için kullanım koşullarını kabul etmelisiniz.";
}

export function validateRegisterInput(input: RegisterInput): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};

  const displayNameError = validateDisplayName(input.displayName);
  if (displayNameError) errors.displayName = displayNameError;

  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(input.password);
  if (passwordError) errors.password = passwordError;

  const confirmError = validatePasswordConfirmation(input.password, input.confirmPassword);
  if (confirmError) errors.confirmPassword = confirmError;

  const termsError = validateTermsAccepted(input.acceptedTerms);
  if (termsError) errors.acceptedTerms = termsError;

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
