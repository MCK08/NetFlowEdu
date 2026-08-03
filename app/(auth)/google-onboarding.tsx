import { useAuth } from "@features/authentication";
import { useSignOut } from "@features/authentication/hooks/useSignOut";
import { GoogleOnboardingScreen } from "@features/authentication/screens/GoogleOnboardingScreen";

export default function GoogleOnboarding() {
  const { firebaseUser } = useAuth();
  const { signOut, isSigningOut } = useSignOut();

  return (
    <GoogleOnboardingScreen
      // Both values come straight off the already-signed-in Firebase Auth
      // user — no additional Google profile request is made.
      defaultDisplayName={firebaseUser?.displayName ?? ""}
      googleEmail={firebaseUser?.email ?? undefined}
      onSignOut={signOut}
      isSigningOut={isSigningOut}
    />
  );
}
