import { useState } from "react";

import { RegisterFieldErrors, RegisterInput } from "../types";
import { hasErrors, validateRegisterInput } from "../validation";
import { mapAuthErrorToMessage } from "../services/errorMapper";
import { useAuth } from "./useAuth";

const INITIAL_INPUT: RegisterInput = {
  displayName: "",
  email: "",
  password: "",
  confirmPassword: "",
  acceptedTerms: false,
};

export function useRegisterForm() {
  const { register } = useAuth();
  const [input, setInput] = useState<RegisterInput>(INITIAL_INPUT);
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    setFormError(null);
    const errors = validateRegisterInput(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return false;

    setIsSubmitting(true);
    try {
      await register(input);
      return true;
    } catch (error) {
      setFormError(mapAuthErrorToMessage(error));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return { input, setField, fieldErrors, formError, isSubmitting, submit };
}
