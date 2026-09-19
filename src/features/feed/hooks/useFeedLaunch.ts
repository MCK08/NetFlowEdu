import { router } from "expo-router";
import { useCallback } from "react";

import { buildFeedLaunchParams, FEED_LAUNCH_ROUTE, FeedLaunchContext } from "../services/feedLaunch";

// Phase 109 — opens the Akış tab with a filter context. `navigate` (not
// push) so the tab is selected rather than stacked, and the params reach the
// feed's own useLocalSearchParams; a fresh nonce is attached on every call.
export function useFeedLaunch() {
  return useCallback((context: Partial<FeedLaunchContext>) => {
    router.navigate({ pathname: FEED_LAUNCH_ROUTE, params: buildFeedLaunchParams(context) } as never);
  }, []);
}
