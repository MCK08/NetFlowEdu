import {
  combineModerationSignals,
  decideImageModeration,
  decideTextModeration,
} from "../../functions/src/moderation/moderationDecision";
import {
  canPublish,
  canTransition,
  applyTransition,
  isTerminal,
  safeStatusFor,
  MODERATION_STATES,
} from "../../functions/src/moderation/moderationStates";
import { callProvider, isProviderSignal } from "../../functions/src/moderation/providers";
import type { ProviderSignal } from "../../functions/src/moderation/providers";
import { evaluateTextRules } from "../../functions/src/moderation/textRules";
import { normalizeForModeration } from "../../functions/src/moderation/textNormalization";

// The decision layer is where "fail closed" is either true or a slogan.
// Every provider failure mode below is unreachable on demand against a real
// vendor, which is exactly why the whole layer is pure and fake-driven.

const rules = (text: string) => evaluateTextRules(normalizeForModeration(text));

const signal = (outcome: ProviderSignal["outcome"], categories: string[] = []): ProviderSignal => ({
  outcome,
  categories,
  retryable: outcome === "unavailable",
});

describe("moderation state machine", () => {
  it("permits publication from approved and nothing else", () => {
    for (const state of MODERATION_STATES) {
      expect(canPublish(state)).toBe(state === "approved");
    }
  });

  it("never lets a provider failure publish", () => {
    // The single most dangerous possible bug in this feature.
    expect(canPublish("failed")).toBe(false);
    expect(canPublish("manual_review")).toBe(false);
    expect(canPublish("pending")).toBe(false);
  });

  it("treats rejection as final", () => {
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(isTerminal("rejected")).toBe(true);
    expect(applyTransition("rejected", "approved")).toBeNull();
  });

  it("lets a human resolve a manual review either way", () => {
    expect(applyTransition("manual_review", "approved")).toBe("approved");
    expect(applyTransition("manual_review", "rejected")).toBe("rejected");
  });

  it("lets a failed scan retry or escalate, but never approve directly", () => {
    expect(canTransition("failed", "scanning")).toBe(true);
    expect(canTransition("failed", "manual_review")).toBe(true);
    expect(canTransition("failed", "approved")).toBe(false);
  });

  it("never rewinds to pending", () => {
    for (const state of MODERATION_STATES) {
      expect(canTransition(state, "pending")).toBe(false);
    }
  });

  it("lets published content be withdrawn but not re-approved", () => {
    expect(canTransition("approved", "removed")).toBe(true);
    expect(canTransition("removed", "approved")).toBe(false);
  });

  it("tells the author nothing about which signal fired", () => {
    // rejected and removed are indistinguishable to the author, and a
    // provider outage reads as "still checking" rather than naming an
    // internal failure.
    expect(safeStatusFor("rejected")).toBe("not_published");
    expect(safeStatusFor("removed")).toBe("not_published");
    expect(safeStatusFor("failed")).toBe("checking");
    expect(safeStatusFor("pending")).toBe("checking");
    expect(safeStatusFor("scanning")).toBe("checking");
  });
});

describe("decideTextModeration", () => {
  it("approves clean text with no provider configured", () => {
    const decision = decideTextModeration({ rules: rules("Bu soruyu nasıl çözerim?"), provider: null });
    expect(decision.state).toBe("approved");
    // The reason records the honest basis: a keyword layer, not an AI.
    expect(decision.reason).toBe("clean_deterministic_only");
  });

  it("rejects an unambiguous deterministic match", () => {
    const decision = decideTextModeration({ rules: rules("siktir git"), provider: null });
    expect(decision.state).toBe("rejected");
    expect(decision.reason).toBe("deterministic_block");
  });

  it("rejects obfuscated abuse", () => {
    expect(decideTextModeration({ rules: rules("s1kt1r"), provider: null }).state).toBe("rejected");
    expect(decideTextModeration({ rules: rules("s i k t i r"), provider: null }).state).toBe("rejected");
    expect(decideTextModeration({ rules: rules("SİKTİR"), provider: null }).state).toBe("rejected");
    expect(decideTextModeration({ rules: rules("siiiktir"), provider: null }).state).toBe("rejected");
  });

  it("does not reject an innocent word that merely contains a short term", () => {
    // The canonical false positive: "sik" inside "klasik"/"fizik"/"müzik".
    // A substring matcher would refuse a physics question.
    for (const text of ["klasik müzik", "fizik sorusu", "Bu klasik bir fizik problemi"]) {
      expect(decideTextModeration({ rules: rules(text), provider: null }).state).toBe("approved");
    }
  });

  it("does not reject ordinary mathematics", () => {
    for (const text of ["2x + 3y = 12", "a b = 4 ise", "%50 indirim", "f(x) = x^2 - 1"]) {
      expect(decideTextModeration({ rules: rules(text), provider: null }).state).toBe("approved");
    }
  });

  it("sends an ambiguous word to a human instead of refusing it", () => {
    // "hayvan" is zoology or an insult depending on context no regex sees.
    const decision = decideTextModeration({ rules: rules("hayvan hücresi nedir"), provider: null });
    expect(decision.state).toBe("manual_review");
  });

  it("sends a phone number to review rather than broadcasting it", () => {
    const decision = decideTextModeration({ rules: rules("bana ulas 0532 111 22 33"), provider: null });
    expect(decision.state).toBe("manual_review");
    expect(decision.categories).toContain("personal_data_phone");
  });

  it("flags repetitive spam for review", () => {
    const decision = decideTextModeration({ rules: rules("bak bak bak bak bak bak bak bak bak"), provider: null });
    expect(decision.categories).toContain("repetitive_spam");
    expect(decision.state).toBe("manual_review");
  });

  it("does NOT approve when a configured provider is unavailable", () => {
    // Fail closed: clean keywords plus a dead provider is not an approval.
    const decision = decideTextModeration({
      rules: rules("tamamen normal bir cevap"),
      provider: signal("unavailable"),
    });
    expect(decision.state).toBe("manual_review");
    expect(decision.reason).toBe("provider_unavailable");
  });

  it("rejects when a configured provider blocks even if keywords pass", () => {
    const decision = decideTextModeration({
      rules: rules("tamamen normal gorunen bir cevap"),
      provider: signal("block", ["harassment"]),
    });
    expect(decision.state).toBe("rejected");
  });

  it("escalates when the provider is unsure", () => {
    expect(
      decideTextModeration({ rules: rules("normal metin"), provider: signal("review") }).state,
    ).toBe("manual_review");
  });

  it("approves only when every consulted signal is clean", () => {
    const decision = decideTextModeration({ rules: rules("normal metin"), provider: signal("clean") });
    expect(decision.state).toBe("approved");
    expect(decision.reason).toBe("clean_all_signals");
  });
});

describe("decideImageModeration", () => {
  it("NEVER approves an image when no provider is configured", () => {
    // This is the load-bearing assertion of the whole image path. A drawing
    // cannot be judged from its extension, MIME type, size or stroke count.
    const decision = decideImageModeration({
      provider: null,
      extractedText: null,
      imageTextAvailable: false,
    });
    expect(decision.state).toBe("manual_review");
    expect(decision.reason).toBe("no_image_provider");
    expect(decision.categories).toContain("image_unverified");
  });

  it("does not approve when the image provider is unavailable", () => {
    const decision = decideImageModeration({
      provider: signal("unavailable"),
      extractedText: null,
      imageTextAvailable: true,
    });
    expect(decision.state).toBe("manual_review");
  });

  it("rejects when the image provider blocks", () => {
    const decision = decideImageModeration({
      provider: signal("block", ["nudity"]),
      extractedText: null,
      imageTextAvailable: true,
    });
    expect(decision.state).toBe("rejected");
    expect(decision.categories).toContain("nudity");
  });

  it("rejects handwritten profanity found by OCR", () => {
    const decision = decideImageModeration({
      provider: signal("clean"),
      extractedText: rules("siktir"),
      imageTextAvailable: true,
    });
    expect(decision.state).toBe("rejected");
    expect(decision.reason).toBe("ocr_deterministic_block");
  });

  it("does not approve a clean-looking image when OCR was never available", () => {
    // An image classifier is exactly what misses a page of handwriting.
    const decision = decideImageModeration({
      provider: signal("clean"),
      extractedText: null,
      imageTextAvailable: false,
    });
    expect(decision.state).toBe("manual_review");
    expect(decision.reason).toBe("no_ocr_provider");
  });

  it("approves only when both image and OCR signals are present and clean", () => {
    const decision = decideImageModeration({
      provider: signal("clean"),
      extractedText: rules("cevap 42"),
      imageTextAvailable: true,
    });
    expect(decision.state).toBe("approved");
  });
});

describe("combineModerationSignals", () => {
  it("takes the worst state, never an average", () => {
    const combined = combineModerationSignals(
      { state: "approved", categories: ["a"], reason: "clean_all_signals" },
      { state: "rejected", categories: ["b"], reason: "image_provider_block" },
    );
    expect(combined.state).toBe("rejected");
  });

  it("does not let a clean caption redeem an unsafe image", () => {
    const combined = combineModerationSignals(
      { state: "approved", categories: [], reason: "clean_deterministic_only" },
      { state: "manual_review", categories: ["image_unverified"], reason: "no_image_provider" },
    );
    expect(combined.state).toBe("manual_review");
    expect(combined.categories).toContain("image_unverified");
  });

  it("approves only when everything approves", () => {
    const combined = combineModerationSignals(
      { state: "approved", categories: [], reason: "clean_all_signals" },
      { state: "approved", categories: [], reason: "clean_all_signals" },
    );
    expect(combined.state).toBe("approved");
  });
});

describe("callProvider", () => {
  it("converts a timeout into unavailable, never clean", async () => {
    const slow = () => new Promise<ProviderSignal>((resolve) => setTimeout(() => resolve(signal("clean")), 200));
    const result = await callProvider(slow, 20);
    expect(result.outcome).toBe("unavailable");
  });

  it("converts a thrown error into unavailable", async () => {
    const result = await callProvider(async () => {
      throw new Error("vendor exploded");
    }, 1000);
    expect(result.outcome).toBe("unavailable");
  });

  it("converts a malformed response into unavailable", async () => {
    // A vendor returning an unexpected shape must not be read as a pass.
    const result = await callProvider(
      async () => ({ verdict: "ok" }) as unknown as ProviderSignal,
      1000,
    );
    expect(result.outcome).toBe("unavailable");
  });

  it("passes a well-formed signal through", async () => {
    const result = await callProvider(async () => signal("block", ["x"]), 1000);
    expect(result.outcome).toBe("block");
  });
});

describe("isProviderSignal", () => {
  it("rejects anything that is not a complete signal", () => {
    expect(isProviderSignal(null)).toBe(false);
    expect(isProviderSignal({ outcome: "clean" })).toBe(false);
    expect(isProviderSignal({ outcome: "nope", categories: [], retryable: false })).toBe(false);
    expect(isProviderSignal({ outcome: "clean", categories: [], retryable: false })).toBe(true);
  });
});
