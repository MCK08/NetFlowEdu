import { FeedScreen } from "@features/feed";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentFeedTab() {
  useThemeSubscription();
  return <FeedScreen />;
}
