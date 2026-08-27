import { VerifyEmailScreen } from "@features/authentication/screens/VerifyEmailScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 49 — wrapped rather than re-exported directly so this route has a
// body to subscribe to theme changes from; VerifyEmailScreen itself is unchanged.
export default function VerifyEmailScreenRoute() {
  useThemeSubscription();
  return <VerifyEmailScreen />;
}
