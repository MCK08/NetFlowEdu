import {
  IMAGE_ANALYSIS_UNAVAILABLE,
  ImageAnalysisProvider,
  ImageAnalysisResult,
  ProviderSignal,
} from "./providers";

// Google Cloud Vision adapter — SafeSearch + document OCR in one call.
//
// WHY NO SDK: @google-cloud/vision would be a new dependency for what is a
// single POST. Node 20 has global fetch, and the function's runtime service
// account (516859581971-compute@developer.gserviceaccount.com, roles/editor)
// can mint its own OAuth token from the instance metadata server. So:
//   * no dependency,
//   * no API key,
//   * no secret, and nothing in Secret Manager,
//   * no service-account JSON anywhere in the repo.
//
// WHY gs:// AND NOT BYTES: the request hands Vision a Cloud Storage URI, so
// Vision fetches the object itself with its own credentials. The image bytes
// never pass through this function, and no shareable download link is ever
// minted for unmoderated content.
//
// PRIVACY: this sends student answer images and drawings to a Google service
// for analysis. That is a real third-party disclosure and is called out in
// the phase report rather than buried here.
//
// PREREQUISITE: vision.googleapis.com must be ENABLED on the project. It was
// DISABLED at the time of writing. If it is still disabled, every call here
// fails and is converted to `unavailable`, which the decision layer treats as
// manual_review — fail-closed, never auto-approved.

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

// Vision's five-level likelihood scale.
type Likelihood =
  | "UNKNOWN"
  | "VERY_UNLIKELY"
  | "UNLIKELY"
  | "POSSIBLE"
  | "LIKELY"
  | "VERY_LIKELY";

const BLOCK_AT: readonly Likelihood[] = ["LIKELY", "VERY_LIKELY"];
const REVIEW_AT: readonly Likelihood[] = ["POSSIBLE"];

// Which SafeSearch categories matter for a student homework app.
//
// `medical` and `spoof` are deliberately EXCLUDED from the block set: a
// biology diagram scores high on `medical`, and `spoof` means "looks like a
// meme", neither of which is an offence here. Including them would refuse
// legitimate schoolwork, which is its own kind of failure.
const BLOCKING_CATEGORIES = ["adult", "violence", "racy"] as const;

interface SafeSearchAnnotation {
  adult?: Likelihood;
  spoof?: Likelihood;
  medical?: Likelihood;
  violence?: Likelihood;
  racy?: Likelihood;
}

async function fetchAccessToken(timeoutMs: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(METADATA_TOKEN_URL, {
        headers: { "Metadata-Flavor": "Google" },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { access_token?: unknown };
      return typeof body.access_token === "string" ? body.access_token : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Outside GCP (local dev, unit tests) the metadata server does not exist.
    // Returning null makes the provider unavailable, which is the correct
    // fail-closed behaviour rather than an exception that could be caught
    // somewhere less careful.
    return null;
  }
}

/**
 * Maps a SafeSearch annotation to a provider signal.
 *
 * Pure and exported so the entire likelihood matrix is unit-testable without
 * a network — the borderline cases are exactly where a mistake would either
 * publish something unsafe or refuse a chemistry diagram.
 */
export function safeSearchToSignal(annotation: SafeSearchAnnotation | undefined): ProviderSignal {
  if (!annotation || typeof annotation !== "object") {
    // A response with no SafeSearch section is malformed, not clean.
    return { outcome: "unavailable", categories: ["malformed_response"], retryable: true };
  }

  const blocked: string[] = [];
  const review: string[] = [];

  for (const category of BLOCKING_CATEGORIES) {
    const value = annotation[category];
    if (typeof value !== "string") continue;
    if (BLOCK_AT.includes(value as Likelihood)) blocked.push(category);
    else if (REVIEW_AT.includes(value as Likelihood)) review.push(category);
  }

  if (blocked.length > 0) {
    return { outcome: "block", categories: blocked, retryable: false };
  }
  if (review.length > 0) {
    return { outcome: "review", categories: review, retryable: false };
  }
  // Every consulted category came back UNLIKELY or better. UNKNOWN counts as
  // neither block nor review, and that is deliberate: Vision returns UNKNOWN
  // when it could not assess, so treating it as clean would be the exact
  // "absence of evidence is evidence of safety" mistake this phase exists to
  // avoid — it is caught below by requiring at least one real verdict.
  const assessed = BLOCKING_CATEGORIES.filter(
    (c) => typeof annotation[c] === "string" && annotation[c] !== "UNKNOWN",
  );
  if (assessed.length === 0) {
    return { outcome: "unavailable", categories: ["no_verdict"], retryable: true };
  }
  return { outcome: "clean", categories: [], retryable: false };
}

/** Extracts OCR text from an annotate response, tolerating either the
 *  fullTextAnnotation or the textAnnotations shape. */
export function extractVisionText(response: Record<string, unknown>): {
  text: string;
  available: boolean;
} {
  const full = response.fullTextAnnotation as { text?: unknown } | undefined;
  if (full && typeof full.text === "string") {
    return { text: full.text, available: true };
  }
  const annotations = response.textAnnotations;
  if (Array.isArray(annotations)) {
    // An EMPTY array is a real result: OCR ran and the image contains no
    // text (a plain diagram). That is available:true with empty text, which
    // is very different from OCR never having run.
    const first = annotations[0] as { description?: unknown } | undefined;
    if (first && typeof first.description === "string") {
      return { text: first.description, available: true };
    }
    return { text: "", available: true };
  }
  return { text: "", available: false };
}

/**
 * Parses a whole annotate response into an analysis result.
 *
 * Exported for tests: every failure mode below (API error payload, missing
 * responses array, per-image error) is unreachable on demand against the live
 * API, so it is proven here instead.
 */
export function parseVisionResponse(payload: unknown): ImageAnalysisResult {
  if (!payload || typeof payload !== "object") return IMAGE_ANALYSIS_UNAVAILABLE;
  const body = payload as Record<string, unknown>;

  // Top-level error object — quota exhausted, API disabled, bad request.
  if (body.error) return IMAGE_ANALYSIS_UNAVAILABLE;

  const responses = body.responses;
  if (!Array.isArray(responses) || responses.length === 0) return IMAGE_ANALYSIS_UNAVAILABLE;

  const first = responses[0] as Record<string, unknown> | null | undefined;
  // A null/non-object entry is malformed, not clean. Without this guard the
  // property access below throws, and an exception escaping the parser would
  // be caught somewhere less careful than here.
  if (!first || typeof first !== "object") return IMAGE_ANALYSIS_UNAVAILABLE;
  // Per-image error: unreadable object, unsupported format, access denied.
  if (first.error) return IMAGE_ANALYSIS_UNAVAILABLE;

  const signal = safeSearchToSignal(first.safeSearchAnnotation as SafeSearchAnnotation | undefined);
  const text = extractVisionText(first);

  return {
    image: signal,
    extractedText: text.text,
    imageTextAvailable: text.available,
  };
}

/**
 * The live adapter.
 *
 * Every failure path — no token, non-2xx, network error, timeout, malformed
 * body — funnels into IMAGE_ANALYSIS_UNAVAILABLE. There is deliberately no
 * branch that returns a clean signal on error.
 */
export function createVisionProvider(timeoutMs = 20000): ImageAnalysisProvider {
  return {
    async analyzeImage(imageRef: string): Promise<ImageAnalysisResult> {
      if (!imageRef.startsWith("gs://")) return IMAGE_ANALYSIS_UNAVAILABLE;

      const token = await fetchAccessToken(Math.min(timeoutMs, 5000));
      if (!token) return IMAGE_ANALYSIS_UNAVAILABLE;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(VISION_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            requests: [
              {
                image: { source: { imageUri: imageRef } },
                // Two features, one request, two billable units. Document
                // text detection rather than plain TEXT_DETECTION because
                // the target is handwriting on a drawing, which is exactly
                // what the document model is tuned for.
                features: [
                  { type: "SAFE_SEARCH_DETECTION" },
                  { type: "DOCUMENT_TEXT_DETECTION" },
                ],
              },
            ],
          }),
        });
        if (!res.ok) return IMAGE_ANALYSIS_UNAVAILABLE;
        return parseVisionResponse(await res.json());
      } catch {
        // Swallowed on purpose: a vendor error string is not something to
        // surface to a student or to persist. The caller sees only
        // "unavailable".
        return IMAGE_ANALYSIS_UNAVAILABLE;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
