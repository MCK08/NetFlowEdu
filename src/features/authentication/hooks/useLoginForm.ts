import { useState } from "react";

import { LoginFieldErrors, LoginInput } from "../types";
import { hasErrors, validateLoginInput } from "../validation";
import { mapAuthErrorToMessage } from "../services/errorMapper";
import { SuspendedAccountError } from "../providers/AuthProvider";
import { useAuth } from "./useAuth";

const INITIAL_INPUT: LoginInput = { email: "", password: "" };

const SUSPENDED_MESSAGE =
  "Hesabınız askıya alınmış. Yardım için okulunuzla veya kurumunuzla iletişime geçin.";

export function useLoginForm() {
  const { signIn } = useAuth();
  const [input, setInput] = useState<LoginInput>(INITIAL_INPUT);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<K extends keyof LoginInput>(key: K, value: LoginInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    setFormError(null);
    const errors = validateLoginInput(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return false;

    setIsSubmitting(true);
    try {
      await signIn(input);
      return true;
    } catch (error) {
      if (error instanceof SuspendedAccountError) {
        setFormError(SUSPENDED_MESSAGE);
      } else {
        setFormError(mapAuthErrorToMessage(error));
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return { input, setField, fieldErrors, formError, isSubmitting, submit };
}
