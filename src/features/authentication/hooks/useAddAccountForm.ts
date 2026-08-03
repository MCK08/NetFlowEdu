import { useState } from "react";

import { LoginFieldErrors, LoginInput } from "../types";
import { hasErrors, validateLoginInput } from "../validation";
import { mapAuthErrorToMessage, ADD_ACCOUNT_SUSPENDED_MESSAGE } from "../services/errorMapper";
import { SuspendedAccountError } from "../providers/AuthProvider";
import { useAuth } from "./useAuth";

// The add-another-account form's state. Deliberately a sibling of
// useLoginForm rather than a reuse of it: this one submits through
// addAccountWithPassword (staging Auth instance, current session untouched)
// instead of signIn (default Auth instance, replaces the session), and the
// two must never be confused. Validation, error mapping and the
// duplicate-submit guard are the shared parts, and those come from the same
// modules useLoginForm uses.
export function useAddAccountForm(initialEmail?: string) {
  const { addAccountWithPassword, addAccountWithGoogle } = useAuth();
  const [input, setInput] = useState<LoginInput>({ email: initialEmail ?? "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<K extends keyof LoginInput>(key: K, value: LoginInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function describe(error: unknown): string {
    return error instanceof SuspendedAccountError
      ? ADD_ACCOUNT_SUSPENDED_MESSAGE
      : mapAuthErrorToMessage(error);
  }

  async function submit(): Promise<boolean> {
    // isSubmitting is checked here as well as reflected in the button's
    // disabled state — a return-key submit can arrive while the button is
    // already busy.
    if (isSubmitting) return false;
    setFormError(null);
    const errors = validateLoginInput(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return false;

    setIsSubmitting(true);
    try {
      await addAccountWithPassword(input);
      return true;
    } catch (error) {
      setFormError(describe(error));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitWithGoogle(idToken: string): Promise<boolean> {
    if (isSubmitting) return false;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await addAccountWithGoogle(idToken);
      return true;
    } catch (error) {
      setFormError(describe(error));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return { input, setField, fieldErrors, formError, isSubmitting, submit, submitWithGoogle };
}
