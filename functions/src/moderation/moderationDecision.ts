// Combines every available signal into ONE moderation state.
//
// Pure: no I/O, no clock, no Firestore. Every provider result and every
// deterministic verdict is passed in, so the whole decision matrix is
// directly testable — including the failure modes that are impossible to
// trigger on demand against a real vendor.
//
// The single rule that governs this file: nothing reaches `approved` unless
// every signal that was CONSULTED came back clean AND every signal that was
// REQUIRED was actually available. Absence of evidence is never evidence of
// safety.

import { ModerationState } from "./moderationStates";
import { ProviderSignal } from "./providers";
import { TextRuleResult } from "./textRules";

export interface TextSignals {
  /** Deterministic keyword/phrase layer. Always present — it needs no
   *  provider. */
  rules: TextRuleResult;
  /** External text provider, or null when none is configured. */
  provider: ProviderSignal | null;
}

export interface ImageSignals {
  /** External image-safety provider, or null when none is configured. */
  provider: ProviderSignal | null;
  /** Text extracted from the image, already run through the deterministic
   *  rules. Null when no OCR provider is configured. */
  extractedText: TextRuleResult | null;
  /** Whether an OCR provider was configured at all. Distinguishes "OCR ran
   *  and found nothing" from "OCR never ran", which are very different
   *  claims about an image of handwriting. */
  imageTextAvailable: boolean;
}

export interface ModerationDecision {
  state: ModerationState;
  /** Coarse, non-reversible categories for the audit trail and the reviewer
   *  queue. Never shown to the author. */
  categories: string[];
  /** Why this decision was reached, in one machine-readable token. Used by
   *  tests and the reviewer UI, never by the client. */
  reason: string;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

/**
 * Decides the state for TEXT-ONLY content (comments, question descriptions).
 *
 * This is the one content type that can be auto-approved with no provider
 * configured, because the deterministic layer needs none. That is a
 * deliberate, bounded claim: "no known term matched" is weaker than "an AI
 * judged this safe", and the phase report says so.
 */
export function decideTextModeration(signals: TextSignals): ModerationDecision {
  const { rules, provider } = signals;

  // A deterministic block is the strongest signal available and is final.
  if (rules.verdict === "block") {
    return { state: "rejected", categories: rules.categories, reason: "deterministic_block" };
  }

  // A configured provider that says "block" is equally final.
  if (provider?.outcome === "block") {
    return {
      state: "rejected",
      categories: dedupe([...rules.categories, ...provider.categories]),
      reason: "provider_block",
    };
  }

  // A configured provider that could not answer must NOT be treated as a
  // clean pass. The content goes to a human instead of being published on
  // the strength of a keyword list alone.
  if (provider && provider.outcome === "unavailable") {
    return {
      state: "manual_review",
      categories: dedupe([...rules.categories, "provider_unavailable"]),
      reason: "provider_unavailable",
    };
  }

  if (rules.verdict === "review" || provider?.outcome === "review") {
    return {
      state: "manual_review",
      categories: dedupe([...rules.categories, ...(provider?.categories ?? [])]),
      reason: "uncertain",
    };
  }

  // No provider configured + nothing matched. Approved, with the honest
  // caveat recorded in the reason: this passed a keyword layer, not an AI.
  return {
    state: "approved",
    categories: [],
    reason: provider ? "clean_all_signals" : "clean_deterministic_only",
  };
}

/**
 * Decides the state for content that includes an IMAGE (photo answers,
 * drawings, question images).
 *
 * With no image provider configured this ALWAYS returns manual_review — it
 * never returns approved. That is the whole point: a drawing cannot be
 * judged from its file extension, its MIME type, its byte size or its stroke
 * count, and pretending otherwise would be the single most dangerous line of
 * code in this feature.
 */
export function decideImageModeration(signals: ImageSignals): ModerationDecision {
  const { provider, extractedText, imageTextAvailable } = signals;

  // OCR found something unambiguous — handwritten profanity or a threat.
  if (extractedText?.verdict === "block") {
    return {
      state: "rejected",
      categories: dedupe(["image_text", ...extractedText.categories]),
      reason: "ocr_deterministic_block",
    };
  }

  if (provider?.outcome === "block") {
    return {
      state: "rejected",
      categories: dedupe(provider.categories),
      reason: "image_provider_block",
    };
  }

  // No image provider at all. Every image goes to a human.
  if (!provider) {
    return {
      state: "manual_review",
      categories: dedupe([
        "image_unverified",
        ...(imageTextAvailable ? [] : ["image_text_unverified"]),
        ...(extractedText?.categories ?? []),
      ]),
      reason: "no_image_provider",
    };
  }

  if (provider.outcome === "unavailable") {
    return {
      state: "manual_review",
      categories: dedupe(["provider_unavailable", ...(extractedText?.categories ?? [])]),
      reason: "provider_unavailable",
    };
  }

  // A provider exists and did not block, but OCR was never available — an
  // image of handwriting is exactly the case image classifiers miss, so this
  // is still not an approval.
  if (!imageTextAvailable) {
    return {
      state: "manual_review",
      categories: dedupe(["image_text_unverified", ...provider.categories]),
      reason: "no_ocr_provider",
    };
  }

  if (provider.outcome === "review" || extractedText?.verdict === "review") {
    return {
      state: "manual_review",
      categories: dedupe([...provider.categories, ...(extractedText?.categories ?? [])]),
      reason: "uncertain",
    };
  }

  return { state: "approved", categories: [], reason: "clean_all_signals" };
}

/**
 * Combines a text decision and an image decision for content that carries
 * both.
 *
 * Strictly the worse of the two — never an average, never a majority. A
 * clean caption does not redeem an unsafe drawing.
 */
export function combineModerationSignals(
  ...decisions: readonly ModerationDecision[]
): ModerationDecision {
  const severity: Record<string, number> = {
    approved: 0,
    manual_review: 1,
    failed: 2,
    rejected: 3,
  };
  let worst: ModerationDecision = {
    state: "approved",
    categories: [],
    reason: "clean_all_signals",
  };
  for (const decision of decisions) {
    if ((severity[decision.state] ?? 0) > (severity[worst.state] ?? 0)) worst = decision;
  }
  return {
    state: worst.state,
    categories: dedupe(decisions.flatMap((d) => d.categories)),
    reason: worst.reason,
  };
}
