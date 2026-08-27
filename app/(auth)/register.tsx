import { RegisterScreen } from "@features/authentication/screens/RegisterScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 49 — wrapped rather than re-exported directly so this route has a
// body to subscribe to theme changes from; RegisterScreen itself is unchanged.
export default function RegisterScreenRoute() {
  useThemeSubscription();
  return <RegisterScreen />;
}
