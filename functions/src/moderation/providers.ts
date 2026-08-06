import { createVisionProvider } from "./visionProvider";

// Provider boundary for external moderation services.
//
// The business layer depends on these types, never on a vendor SDK — which
// is what let Phase 17B add Google Cloud Vision by writing one adapter
// (visionProvider.ts) and changing one line of resolveProviders(), with no
// change at all to the decision logic that consumes it.
//
// Current wiring:
//   text          — none. No external text vendor; the deterministic Turkish
//                   layer needs none.
//   imageAnalysis — Google Cloud Vision, SafeSearch + document OCR.
//
// Every interface here is written so that "not configured" and "configured
// but down" take the IDENTICAL fail-closed path, so there is no untested
// branch waiting to be discovered in production.

export type ProviderOutcome =
  /** Provider examined the content and found nothing actionable. */
  | "clean"
  /** Provider is confident the content violates policy. */
  | "block"
  /** Provider is unsure, or the content is borderline. */
  | "review"
  /** Provider could not be reached, timed out, or returned something this
   *  code cannot parse. NEVER equivalent to `clean`. */
  | "unavailable";

export interface ProviderSignal {
  outcome: ProviderOutcome;
  /** Coarse policy categories. Never raw provider payloads, never scores
   *  that would leak a threshold if echoed back. */
  categories: string[];
  /** Whether a later retry could plausibly succeed. Only meaningful for
   *  `unavailable`. */
  retryable: boolean;
}

export const PROVIDER_UNAVAILABLE: ProviderSignal = {
  outcome: "unavailable",
  categories: ["provider_unavailable"],
  retryable: true,
};

export interface TextModerationProvider {
  moderateText(text: string): Promise<ProviderSignal>;
}

/**
 * Everything one image analysis yields, from a SINGLE provider round trip.
 *
 * Combined rather than split into separate safety and OCR calls because
 * Vision bills per FEATURE per image but accepts both features in one
 * request — issuing two calls would double the latency for no benefit and
 * no cost saving.
 */
export interface ImageAnalysisResult {
  /** Visual safety verdict: nudity, violence, and similar. */
  image: ProviderSignal;
  /** Text found INSIDE the image — handwriting, screenshots. Fed back
   *  through the deterministic Turkish layer; that is the only way
   *  handwritten profanity is ever caught. */
  extractedText: string;
  /** False when OCR did not actually run. Distinguishes "OCR found nothing"
   *  from "OCR never happened", which are very different claims about a page
   *  of handwriting. */
  imageTextAvailable: boolean;
}

export interface ImageAnalysisProvider {
  /** imageRef is a gs:// URI, never image bytes and never a public URL — the
   *  provider pulls the object with its own credentials, so the bytes never
   *  pass through this codebase and no shareable link is minted. */
  analyzeImage(imageRef: string): Promise<ImageAnalysisResult>;
}

export interface ModerationProviders {
  text: TextModerationProvider | null;
  imageAnalysis: ImageAnalysisProvider | null;
}

/** Fail-closed analysis result: used whenever the provider is missing,
 *  unreachable, or returns something unparseable. Never `clean`. */
export const IMAGE_ANALYSIS_UNAVAILABLE: ImageAnalysisResult = {
  image: PROVIDER_UNAVAILABLE,
  extractedText: "",
  imageTextAvailable: false,
};

/**
 * The providers available in this deployment.
 *
 * `text` is null: there is no external text-moderation vendor, and the
 * deterministic Turkish layer needs none.
 *
 * `imageAnalysis` is Google Cloud Vision (SafeSearch + document OCR), wired
 * in Phase 17B. It requires vision.googleapis.com to be ENABLED on the
 * project — no dependency, no API key and no secret, because the function's
 * own runtime service account mints the token (see visionProvider.ts).
 *
 * If the API is disabled, the adapter's every failure path returns
 * `unavailable`, which the decision layer turns into manual_review. So a
 * project without Vision enabled is SAFE but not USABLE for image answers:
 * nothing is auto-approved, and every answer waits for a human.
 */
export function resolveProviders(): ModerationProviders {
  return { text: null, imageAnalysis: createVisionProvider() };
}

/**
 * Runs a provider call with a hard timeout, converting every failure mode
 * into a ProviderSignal.
 *
 * This function is the reason a vendor outage cannot publish anything: there
 * is no path through it that returns `clean` on error. A rejected promise, a
 * timeout and a malformed response all produce `unavailable`.
 */
export async function callProvider(
  call: () => Promise<ProviderSignal>,
  timeoutMs: number,
): Promise<ProviderSignal> {
  // ReturnType<typeof setTimeout>, not NodeJS.Timeout: the root tsconfig
  // typechecks functions/ alongside the React Native client, where the DOM
  // lib types setTimeout as returning a number.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<ProviderSignal>((resolve) => {
      timer = setTimeout(() => resolve(PROVIDER_UNAVAILABLE), timeoutMs);
    });
    const signal = await Promise.race([call(), timeout]);
    return isProviderSignal(signal) ? signal : PROVIDER_UNAVAILABLE;
  } catch {
    // Deliberately swallows the error rather than rethrowing or logging it
    // here: the caller decides the user-facing outcome, and a vendor error
    // string is not something to surface or to store.
    return PROVIDER_UNAVAILABLE;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Guards against a provider adapter returning something unexpected — a
 *  malformed response must not be read as a clean one. */
export function isProviderSignal(value: unknown): value is ProviderSignal {
  if (!value || typeof value !== "object") return false;
  const signal = value as Record<string, unknown>;
  return (
    (signal.outcome === "clean" ||
      signal.outcome === "block" ||
      signal.outcome === "review" ||
      signal.outcome === "unavailable") &&
    Array.isArray(signal.categories) &&
    typeof signal.retryable === "boolean"
  );
}
