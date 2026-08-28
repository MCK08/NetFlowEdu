import { TeacherFeedScreen } from "@features/feed";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 50 — HOME = FEED for teachers too (§21). The class list this route
// used to render now lives at ./classes.tsx, still one tap away in the tab
// bar; nothing about Teacher Dashboard / Class Performance changed.
export default function TeacherFeedTab() {
  useThemeSubscription();
  return <TeacherFeedScreen />;
}
