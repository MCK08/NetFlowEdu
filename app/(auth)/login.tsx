import { LoginScreen } from "@features/authentication/screens/LoginScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 49 — wrapped rather than re-exported directly so this route has a
// body to subscribe to theme changes from; LoginScreen itself is unchanged.
export default function LoginScreenRoute() {
  useThemeSubscription();
  return <LoginScreen />;
}
