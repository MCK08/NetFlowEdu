// Deterministic term data for Turkish text moderation.
//
// ============================ SERVER ONLY ============================
// This file must never be imported from src/ or reach a client bundle.
// tests/unit/moderationServerOnly.test.ts fails if it does. Two reasons:
// shipping it hands an attacker a local oracle to iterate bypasses against,
// and the file itself is not something to render in a product.
// =====================================================================
//
// SCOPE, stated plainly: this is a keyword layer, not moderation. It catches
// unambiguous slurs and threats written in the clear or lightly obfuscated.
// It cannot read intent, sarcasm, or context, so it never decides "safe" on
// its own — a clean pass here means "nothing known matched", which the
// decision layer treats as *eligible* for approval, not as approved.

import { collapseRepeats, NormalizedText, tokenVariants } from "./textNormalization";

// Unambiguous single-word abuse: profanity, slurs, sexual vulgarity.
// Matched as WHOLE TOKENS only — see matchTokens for why substring matching
// is unusable (the classic failure: "sik" is a substring of "klasik",
// "müzik", "fizik"; a substring matcher would reject a physics question).
//
// Entries are stored already folded to the normalizer's output alphabet
// (Turkish letters -> ASCII, lowercase), so "şerefsiz" is listed as
// "serefsiz" and matches both spellings.
const BLOCK_TOKENS: readonly string[] = [
  "amk",
  "aq",
  "amina",
  "amcik",
  "orospu",
  "orospucocugu",
  "pic",
  "picler",
  "gavat",
  "yavsak",
  "siktir",
  "sikeyim",
  "sikerim",
  "sikik",
  "siktim",
  "godumu",
  "gotveren",
  "ibne",
  "top",
  "yarrak",
  "yarram",
  "tasak",
  "meme",
  "salak",
  "aptal",
  "gerizekali",
  "mal",
  "embesil",
  "serefsiz",
  "namussuz",
  "pust",
  "kahpe",
  "surtuk",
  "kaltak",
  "denyo",
  "dangalak",
  "hayvan",
  "esek",
  "domuz",
];

// Tokens above that are ALSO ordinary Turkish words and must not, alone,
// refuse a submission. "top" is a ball, "meme" is a breast (anatomy — a
// legitimate biology question), "mal" is goods, "hayvan"/"esek"/"domuz" are
// animals a biology question is entitled to name.
//
// These downgrade to review rather than block: a human decides whether
// "hayvan" was zoology or an insult, because no amount of regex can.
const AMBIGUOUS_TOKENS: ReadonlySet<string> = new Set([
  "top",
  "meme",
  "mal",
  "hayvan",
  "esek",
  "domuz",
  "salak",
  "aptal",
]);

// Multi-word sequences. Threats and targeted abuse are usually phrases, and
// the individual words are innocent ("seni", "olduracegim").
const BLOCK_PHRASES: readonly (readonly string[])[] = [
  ["seni", "olduracegim"],
  ["seni", "gebertecegim"],
  ["olduruce", "gim"],
  ["ananI", "sikeyim"],
  ["anani", "sikeyim"],
  ["ana", "avrat"],
  ["kendini", "oldur"],
  ["gebermeni", "istiyorum"],
];

// Phrases that indicate a risk worth a human look but are not, by
// themselves, an offence: self-harm language (which needs care, not a
// refusal), and meeting-up language.
const REVIEW_PHRASES: readonly (readonly string[])[] = [
  ["kendimi", "oldurecegim"],
  ["yasamak", "istemiyorum"],
  ["intihar", "edecegim"],
  ["bulusalim", "mi"],
  ["adresini", "ver"],
];

// Contact / personal data. Not abuse, but a child-safety concern in a
// student product: a phone number or address in a public answer should be
// looked at before it is broadcast. Applied to the NORMALIZED string rather
// than tokens, because these span token boundaries.
const REVIEW_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  // Turkish mobile numbers, with or without separators/country code.
  { name: "phone", pattern: /(?:\+?90[\s.-]?)?0?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/ },
  { name: "email", pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/ },
  // Social handles are how off-platform contact actually happens.
  { name: "social_handle", pattern: /(?:instagram|snapchat|telegram|whatsapp|tiktok)\s*[:@]?\s*\S+/ },
];

export type TextRuleVerdict = "clean" | "block" | "review";

export interface TextRuleResult {
  verdict: TextRuleVerdict;
  /** Coarse categories for the audit trail. NEVER the matched term itself —
   *  copying abusive text into logs just moves the problem. */
  categories: string[];
}

function matchTokens(
  normalized: NormalizedText,
  terms: readonly string[],
): { hit: string | null } {
  const candidates = new Set<string>();
  for (const token of normalized.tokens) {
    for (const variant of tokenVariants(token)) candidates.add(variant);
  }
  // Letter-spacing bypass ("s i k t i r") arrives here as one joined token.
  for (const joined of normalized.joinedSingles) {
    for (const variant of tokenVariants(joined)) candidates.add(variant);
  }
  for (const term of terms) {
    if (candidates.has(term)) return { hit: term };
    // The term list is stored un-collapsed; collapse it the same way so
    // "orospuu" and "orospu" agree.
    if (candidates.has(collapseRepeats(term, 3))) return { hit: term };
  }
  return { hit: null };
}

function matchPhrases(
  normalized: NormalizedText,
  phrases: readonly (readonly string[])[],
): boolean {
  const tokens = normalized.tokens;
  for (const phrase of phrases) {
    if (phrase.length === 0 || phrase.length > tokens.length) continue;
    for (let i = 0; i + phrase.length <= tokens.length; i += 1) {
      let matched = true;
      for (let j = 0; j < phrase.length; j += 1) {
        if (tokens[i + j] !== phrase[j]) {
          matched = false;
          break;
        }
      }
      if (matched) return true;
    }
  }
  return false;
}

/**
 * Runs every deterministic check and returns the STRONGEST verdict.
 *
 * Ordering matters: a block anywhere wins over a review anywhere, and review
 * wins over clean. There is no scoring or threshold — a threshold implies a
 * confidence this layer does not have.
 */
export function evaluateTextRules(normalized: NormalizedText): TextRuleResult {
  const categories: string[] = [];

  if (matchPhrases(normalized, BLOCK_PHRASES)) {
    return { verdict: "block", categories: ["threat_or_targeted_abuse"] };
  }

  const unambiguous = BLOCK_TOKENS.filter((t) => !AMBIGUOUS_TOKENS.has(t));
  if (matchTokens(normalized, unambiguous).hit) {
    return { verdict: "block", categories: ["profanity_or_slur"] };
  }

  // Everything below only ever escalates to review.
  if (matchTokens(normalized, [...AMBIGUOUS_TOKENS]).hit) {
    categories.push("possible_insult");
  }
  if (matchPhrases(normalized, REVIEW_PHRASES)) {
    categories.push("wellbeing_or_contact");
  }
  for (const { name, pattern } of REVIEW_PATTERNS) {
    if (pattern.test(normalized.normalized)) categories.push(`personal_data_${name}`);
  }

  // Meaningless repetition — a spam signal, not an abuse signal.
  if (normalized.tokens.length >= 8) {
    const unique = new Set(normalized.tokens).size;
    if (unique <= Math.max(1, Math.floor(normalized.tokens.length / 6))) {
      categories.push("repetitive_spam");
    }
  }

  return { verdict: categories.length > 0 ? "review" : "clean", categories };
}
