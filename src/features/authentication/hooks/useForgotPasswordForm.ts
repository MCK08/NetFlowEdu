import { useState } from "react";

import { ForgotPasswordFieldErrors, ForgotPasswordInput } from "../types";
import { hasErrors, validateForgotPasswordInput } from "../validation";
import { useAuth } from "./useAuth";

const INITIAL_INPUT: ForgotPasswordInput = { email: "" };

const GENERIC_SUCCESS_MESSAGE =
  "Bu e-posta adresine kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.";

export function useForgotPasswordForm() {
  const { sendPasswordReset } = useAuth();
  const [input, setInput] = useState<ForgotPasswordInput>(INITIAL_INPUT);
  const [fieldErrors, setFieldErrors] = useState<ForgotPasswordFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function setField<K extends keyof ForgotPasswordInput>(
    key: K,
    value: ForgotPasswordInput[K],
  ) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    setSuccessMessage(null);
    const errors = validateForgotPasswordInput(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return false;

    setIsSubmitting(true);
    try {
      await sendPasswordReset(input);
      setSuccessMessage(GENERIC_SUCCESS_MESSAGE);
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }

  return { input, setField, fieldErrors, isSubmitting, successMessage, submit };
}
