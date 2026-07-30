import { useState } from "react";

import { validateDisplayName, validateUsername } from "../validation";
import { mapAuthErrorToMessage } from "../services/errorMapper";
import { IntendedRole } from "../types";
import { useAuth } from "./useAuth";

interface GoogleOnboardingInput {
  displayName: string;
  username: string;
  intendedRole: IntendedRole;
}

const INITIAL_INPUT: GoogleOnboardingInput = {
  displayName: "",
  username: "",
  intendedRole: "student",
};

// First-time-only form for a brand-new Google sign-up — the equivalent of
// RegisterScreen's displayName/username/role fields, minus password (there
// is none for a Google account). Submits via AuthProvider.
// completeGoogleOnboarding, which reuses the SAME initializeOnboarding/
// setUsername Cloud Functions email/password registration goes through.
export function useGoogleOnboardingForm(defaultDisplayName: string) {
  const { completeGoogleOnboarding } = useAuth();
  const [input, setInput] = useState<GoogleOnboardingInput>({
    ...INITIAL_INPUT,
    displayName: defaultDisplayName,
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof GoogleOnboardingInput, string>>>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<K extends keyof GoogleOnboardingInput>(key: K, value: GoogleOnboardingInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    setFormError(null);
    const errors: Partial<Record<keyof GoogleOnboardingInput, string>> = {
      displayName: validateDisplayName(input.displayName),
      username: validateUsername(input.username),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return false;

    setIsSubmitting(true);
    try {
      await completeGoogleOnboarding(input);
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
