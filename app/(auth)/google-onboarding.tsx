import { useAuth } from "@features/authentication";
import { GoogleOnboardingScreen } from "@features/authentication/screens/GoogleOnboardingScreen";

export default function GoogleOnboarding() {
  const { firebaseUser } = useAuth();
  return <GoogleOnboardingScreen defaultDisplayName={firebaseUser?.displayName ?? ""} />;
}
