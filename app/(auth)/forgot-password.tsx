import { ForgotPasswordScreen } from "@features/authentication/screens/ForgotPasswordScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 49 — wrapped rather than re-exported directly so this route has a
// body to subscribe to theme changes from; ForgotPasswordScreen itself is unchanged.
export default function ForgotPasswordScreenRoute() {
  useThemeSubscription();
  return <ForgotPasswordScreen />;
}
