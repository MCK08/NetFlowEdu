import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

// No new dependency (no @react-native-community/netinfo) — connectivity is
// inferred from whether a lightweight HEAD request actually completes,
// rechecked periodically and whenever the app returns to the foreground
// (the two moments a stale "online" reading is most likely: the device
// lost signal while backgrounded, or a request is about to be retried).
const PROBE_URL = "https://www.gstatic.com/generate_204";
const PROBE_TIMEOUT_MS = 4000;
const RECHECK_INTERVAL_MS = 15000;

async function probeConnectivity(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // `no-cors` is required on web: gstatic.com sends no
    // Access-Control-Allow-Origin header, so a normal cross-origin fetch
    // would reject with "Failed to fetch" regardless of real connectivity
    // — confirmed by hand (a plain HEAD request failed even with working
    // internet; the identical request with mode:"no-cors" resolved). The
    // resulting response is opaque (status 0, unreadable) on web, but
    // that's fine — only whether the promise resolves at all matters
    // here. Native `fetch` ignores `mode` harmlessly.
    await fetch(PROBE_URL, { method: "HEAD", mode: "no-cors", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// Defaults to `true` (online) so a slow first probe never shows a false
// "you're offline" flash on an app that's actually connected fine.
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  // Guards against an in-flight probe's result landing after a newer one
  // was already started (e.g. app backgrounded mid-probe) — only the
  // latest probe is allowed to update state.
  const probeIdRef = useRef(0);

  const recheck = useCallback(async () => {
    const thisProbeId = ++probeIdRef.current;
    const online = await probeConnectivity();
    if (probeIdRef.current === thisProbeId) setIsOnline(online);
  }, []);

  useEffect(() => {
    recheck();
    const interval = setInterval(recheck, RECHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") recheck();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [recheck]);

  return { isOnline, recheck };
}
