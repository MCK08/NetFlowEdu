import { useState } from "react";

import { RegisterFieldErrors, RegisterInput } from "../types";
import { hasErrors, validateRegisterInput } from "../validation";
import { mapAuthErrorToMessage } from "../services/errorMapper";
import { useAuth } from "./useAuth";

const INITIAL_INPUT: RegisterInput = {
  displayName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  acceptedTerms: false,
  intendedRole: "student",
  organizationName: "",
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

  interface SubmitResult {
    success: boolean;
    teacherRequestSubmitted: boolean;
  }

  async function submit(): Promise<SubmitResult> {
    setFormError(null);
    const errors = validateRegisterInput(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return { success: false, teacherRequestSubmitted: false };

    setIsSubmitting(true);
    try {
      const { teacherRequestSubmitted } = await register(input);
      return { success: true, teacherRequestSubmitted };
    } catch (error) {
      setFormError(mapAuthErrorToMessage(error));
      return { success: false, teacherRequestSubmitted: false };
    } finally {
      setIsSubmitting(false);
    }
  }

  return { input, setField, fieldErrors, formError, isSubmitting, submit };
}
