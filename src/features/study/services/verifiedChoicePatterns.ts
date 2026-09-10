import { LearningEvent } from "@features/learningStory/services/learningTrail";

// Phase 78 — repeated authored choice meanings, across DIFFERENT questions.
//
// WHAT THIS CLAIMS
//
// "In the recent learning records, the same verified authored selection
// meaning came up on N different questions." That is all. Every part of it is
// something the server wrote down at the moment it happened.
//
// WHAT IT REFUSES TO CLAIM
//
// Not that the student holds a misconception. Not that they misunderstand a
// concept. Not why they picked what they picked. The evidence is that an
// option carrying an authored meaning was selected — the author's
// interpretation of that option, repeated. A learner may pick a distractor
// while reasoning correctly and slipping, or while guessing. Turning "this
// option was chosen twice" into "you do not understand signs" would be exactly
// the fabrication Phase 71 refused and Phase 77 was careful not to become.
//
// WHY TWO DIFFERENT QUESTIONS, NOT TWO OCCURRENCES
//
// Because one question repeated is already owned, and better answered, by
// Phase 71: repeatedly struggling with the SAME question is a same-question
// pattern, and it may say more about that question than about a meaning. What
// is new here — and what no earlier phase could see — is the same authored
// meaning showing up somewhere ELSE. That is the only shape that suggests the
// signal travels with the student rather than with the item, and it is the
// only shape this module reports.
//
// WHY THERE IS STILL NO "RESOLVED" STATE
//
// Phase 78 could not say anything about what came after a pattern, because the
// only thing recorded was what the student SELECTED. "They have not picked X
// lately" was ambiguous between two unrelated facts: they saw X and chose
// otherwise, or X was never in front of them again.
//
// Phase 79 closes exactly that gap and nothing wider. The server now also
// records which authored meanings were SELECTABLE at the moment a student
// picked something, so "offered again and not re-selected" becomes a checkable
// fact rather than an inference from silence.
//
// That earns a RECOVERY SIGNAL. It does not earn "resolved", "mastered" or
// "understood", and this module still has no such state. A student who is
// offered a distractor and picks something else may have reasoned it through,
// guessed, or chosen a different wrong answer entirely. What can be said is
// what happened: the trap was on the page, and it was not taken. That is the
// whole claim.

/** How many patterns a surface may show. Small on purpose: this is a short
 *  reflective list, not an error log. */
export const MAX_VISIBLE_CHOICE_PATTERNS = 4;

/** The threshold for saying "repeated" at all. */
export const MIN_OCCURRENCES = 2;

/** The threshold that makes it a CROSS-QUESTION signal rather than a
 *  same-question one Phase 71 already covers. */
export const MIN_DISTINCT_QUESTIONS = 2;

/** Phase 79 — how many later, distinct questions must offer the meaning and
 *  not have it taken before a recovery signal is stated.
 *
 *  Deliberately the same shape as the repetition threshold above: one declined
 *  opportunity is a single moment and could be anything, and requiring breadth
 *  across questions is what stopped the repetition claim from being about one
 *  item. The evidence for recovering should not be weaker than the evidence
 *  that raised the pattern. */
export const MIN_RECOVERY_OPPORTUNITIES = 2;
export const MIN_RECOVERY_DISTINCT_QUESTIONS = 2;

/** Phase 79 — evidence that the same authored meaning was put in front of the
 *  student again, after the pattern, and was not taken.
 *
 *  Every field is a count of real events. There is no score, no probability and
 *  no "resolved" flag, because none of those is something the evidence can
 *  support. */
export interface ChoiceRecoverySignal {
  /** Later events that offered this meaning and where the student picked
   *  something else. */
  declinedOpportunityCount: number;
  /** How many DIFFERENT questions those came from. */
  distinctQuestionCount: number;
  /** The selection this window opens after — always the most recent time the
   *  meaning WAS taken. */
  since: number;
  lastDeclinedAt: number;
}

export interface VerifiedChoicePattern {
  /** Stable across renders. Internal only — it contains the conceptKey and the
   *  author's uid, and neither may ever reach a screen. */
  id: string;
  subject: string;
  topic: string;
  /** Total qualifying selections of this meaning in the window. */
  occurrenceCount: number;
  /** How many DIFFERENT questions contributed. Always >= MIN_DISTINCT_QUESTIONS. */
  distinctQuestionCount: number;
  /** Server clock of the most recent qualifying selection. */
  lastSeenAt: number;
  /** The questions that contributed, most recently seen first. Lets a caller
   *  show evidence markers without re-deriving them. */
  questionIds: string[];
  /** Phase 79 — present only when the strict post-pattern contract passes.
   *
   *  Null means "no recovery evidence right now", which covers three genuinely
   *  different situations the UI must not conflate: the meaning has not been
   *  offered again, it has been offered too few times to say anything, or it
   *  was offered and taken again. Only the last of those is a step backwards,
   *  and none of them is a failure to report. */
  recovery: ChoiceRecoverySignal | null;
}

export interface VerifiedChoicePatternMemory {
  patterns: VerifiedChoicePattern[];
  /** Qualifying semantic events seen in the window, whether or not any of them
   *  formed a pattern. Distinguishes "nothing repeated" from "there is barely
   *  anything to look at yet" — two different sentences for the student. */
  semanticEventCount: number;
  isEmpty: boolean;
}

interface Accumulator {
  id: string;
  /** The identity's components, kept alongside the joined id so the recovery
   *  pass compares fields rather than re-splitting a delimited string. */
  identity: { namespaceId: string; conceptKey: string; subject: string; topic: string };
  subject: string;
  topic: string;
  occurrenceCount: number;
  lastSeenAt: number;
  /** questionId -> most recent occurrence, so distinct count and evidence
   *  ordering both come from one pass. */
  questions: Map<string, number>;
}

/** Whether this event carries evidence that can be grouped across questions.
 *
 *  Every component of the identity must be present. A missing one is never
 *  filled in with a default, because the defaults would all be wrong in the
 *  same direction: an absent namespace would merge two authors, and an absent
 *  subject or topic would merge two unrelated areas of the curriculum. Unknown
 *  is not a wildcard. */
function qualifies(event: LearningEvent): boolean {
  const semantic = event.semanticChoice;
  if (!semantic) return false;
  if (!semantic.namespaceId.trim()) return false;
  if (!semantic.conceptKey.trim()) return false;
  if (!event.questionId) return false;
  // Phase 70's concept scope, trim-only, exactly as every other surface reads
  // it. An event whose question metadata never resolved has "" for both and is
  // skipped rather than grouped under an invented heading.
  if (!event.subject.trim() || !event.topic.trim()) return false;
  return true;
}

/** The identity two occurrences must share to be the same pattern.
 *
 *  Four components, and each one is a refusal to merge things that only look
 *  alike:
 *
 *   · namespaceId — a conceptKey is the AUTHOR's word, not a global taxonomy
 *     term. Two teachers may both write "sign_transfer_error" and mean
 *     different things; nothing in the repository defines a shared vocabulary,
 *     so merging across authors would invent one.
 *   · conceptKey  — the meaning itself.
 *   · subject + topic — the conservative learning scope. The same author may
 *     reuse a key in an unrelated area; without a curated taxonomy saying those
 *     are the same idea, treating them as one would be a guess. Phase 70's
 *     concept identity is reused rather than a second normalizer invented. */
function identityOf(event: LearningEvent): string {
  const semantic = event.semanticChoice!;
  return [
    semantic.namespaceId.trim(),
    semantic.conceptKey.trim(),
    event.subject.trim(),
    event.topic.trim(),
  ].join("|");
}

/** Whether one event shows this exact identity being OFFERED and passed over.
 *
 *  Four things must all hold, and each rules out a different way of being
 *  wrong:
 *
 *   · the event carries opportunity evidence at all — a legacy event, or an
 *     outcome recorded without touching the options, proves nothing about what
 *     was on the page, and reading its silence as a decline is exactly the
 *     inference Phase 78 refused to make;
 *   · the namespace matches — another author's identical key is a different
 *     meaning, not the same one declined;
 *   · the concept scope matches — the same author's key in an unrelated topic
 *     is held apart by Phase 78's identity, and must be here too;
 *   · this meaning was actually among the options offered, and the student's
 *     pick was NOT it.
 *
 *  The last clause is why `selectedChoice` is stored: it is the difference
 *  between "chose otherwise" and "was never asked". */
function declinesIdentity(
  event: LearningEvent,
  identity: { namespaceId: string; conceptKey: string; subject: string; topic: string },
): boolean {
  const offered = event.semanticOpportunities;
  if (!offered) return false;
  if (offered.namespaceId.trim() !== identity.namespaceId) return false;
  if (event.subject.trim() !== identity.subject) return false;
  if (event.topic.trim() !== identity.topic) return false;
  if (!offered.conceptKeys.some((key) => key.trim() === identity.conceptKey)) return false;

  // Taken, not declined. This is a re-selection, and the window logic below
  // has already excluded anything before the latest one — so reaching here
  // with a matching selection would mean counting a step backwards as a step
  // forwards.
  const selected = event.semanticChoice;
  if (
    selected &&
    selected.namespaceId.trim() === identity.namespaceId &&
    selected.conceptKey.trim() === identity.conceptKey
  ) {
    return false;
  }
  return true;
}

/** The recovery evidence for one already-repeated identity, or null.
 *
 *  The window opens at `since` — the most recent time this meaning WAS taken —
 *  and that single choice is what makes re-selection self-correcting. There is
 *  no separate "reset" branch to get wrong: a later selection moves `since`
 *  forward, and every decline before it falls out of the window automatically.
 *  Evidence earned before a relapse can never be presented as current. */
function resolveRecovery(
  events: readonly LearningEvent[],
  identity: { namespaceId: string; conceptKey: string; subject: string; topic: string },
  since: number,
): ChoiceRecoverySignal | null {
  let declinedOpportunityCount = 0;
  let lastDeclinedAt = 0;
  const questions = new Set<string>();

  for (const event of events) {
    // Strictly after: the selection that opens the window is not evidence
    // against itself.
    if (event.occurredAt <= since) continue;
    if (!event.questionId) continue;
    if (!declinesIdentity(event, identity)) continue;

    declinedOpportunityCount += 1;
    questions.add(event.questionId);
    if (event.occurredAt > lastDeclinedAt) lastDeclinedAt = event.occurredAt;
  }

  // BOTH thresholds. Answering one question twice is not breadth, for the same
  // reason it was not breadth when the pattern was formed.
  if (declinedOpportunityCount < MIN_RECOVERY_OPPORTUNITIES) return null;
  if (questions.size < MIN_RECOVERY_DISTINCT_QUESTIONS) return null;

  return {
    declinedOpportunityCount,
    distinctQuestionCount: questions.size,
    since,
    lastDeclinedAt,
  };
}

/** Builds the memory from the bounded event window.
 *
 *  O(n) over events plus one sort of the qualifying groups. Pure: no Firestore
 *  call, no clock read, no randomness — the same events always produce the same
 *  patterns in the same order. */
export function buildVerifiedChoicePatterns(params: {
  events: readonly LearningEvent[];
}): VerifiedChoicePatternMemory {
  const groups = new Map<string, Accumulator>();
  let semanticEventCount = 0;

  for (const event of params.events) {
    if (!qualifies(event)) continue;
    semanticEventCount += 1;

    const id = identityOf(event);
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        identity: {
          namespaceId: event.semanticChoice!.namespaceId.trim(),
          conceptKey: event.semanticChoice!.conceptKey.trim(),
          subject: event.subject.trim(),
          topic: event.topic.trim(),
        },
        subject: event.subject.trim(),
        topic: event.topic.trim(),
        occurrenceCount: 0,
        lastSeenAt: event.occurredAt,
        questions: new Map(),
      };
      groups.set(id, group);
    }

    group.occurrenceCount += 1;
    if (event.occurredAt > group.lastSeenAt) group.lastSeenAt = event.occurredAt;
    const previous = group.questions.get(event.questionId);
    if (previous === undefined || event.occurredAt > previous) {
      group.questions.set(event.questionId, event.occurredAt);
    }
  }

  const patterns: VerifiedChoicePattern[] = [];
  for (const group of groups.values()) {
    // BOTH thresholds, and the distinct-question one is what keeps this out of
    // Phase 71's territory: three selections on one question is a real thing
    // that happened, and it is not this.
    if (group.occurrenceCount < MIN_OCCURRENCES) continue;
    if (group.questions.size < MIN_DISTINCT_QUESTIONS) continue;

    patterns.push({
      id: group.id,
      subject: group.subject,
      topic: group.topic,
      occurrenceCount: group.occurrenceCount,
      distinctQuestionCount: group.questions.size,
      lastSeenAt: group.lastSeenAt,
      questionIds: [...group.questions.entries()]
        .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
        .map(([questionId]) => questionId),
      // Evaluated only for identities that ALREADY qualified as repeated —
      // both threshold checks are above this line. Recovery is a statement
      // about a pattern, so there is nothing to recover from until there is
      // one, and a stray declined opportunity can never manufacture a
      // "recovering" state on its own.
      recovery: resolveRecovery(params.events, group.identity, group.lastSeenAt),
    });
  }

  // Deterministic, and ordered by RECENCY first because that is the only
  // ordering that is honest here: nothing in this module ranks how serious a
  // pattern is, and a count-first order would imply it did. Ties fall through
  // to breadth, then volume, then the identity itself, so two runs over the
  // same window can never disagree.
  patterns.sort((a, b) => {
    if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
    if (b.distinctQuestionCount !== a.distinctQuestionCount) {
      return b.distinctQuestionCount - a.distinctQuestionCount;
    }
    if (b.occurrenceCount !== a.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
    return a.id.localeCompare(b.id);
  });

  const visible = patterns.slice(0, MAX_VISIBLE_CHOICE_PATTERNS);
  return {
    patterns: visible,
    semanticEventCount,
    isEmpty: visible.length === 0,
  };
}

// Student-facing copy. Fixed sentences, never generated, never interpolated
// with an internal key, and never causal.
//
// Note what none of them say: nothing here tells the student what they think,
// what they got wrong, or what they do not understand. The strongest claim is
// that the same recorded selection meaning came up on more than one question —
// which is a fact about the records, stated as one.

/** The repetition fact for one pattern. Bounded language throughout: the
 *  window is what was looked at, and the copy says so rather than implying a
 *  lifetime. */
export function choicePatternFact(pattern: VerifiedChoicePattern): string {
  return `Son öğrenme kayıtlarında aynı seçim örüntüsü ${pattern.distinctQuestionCount} farklı soruda tekrarlandı.`;
}

/** The supporting counts, stated as counts and never as a rate or a score. */
export function choicePatternEvidence(pattern: VerifiedChoicePattern): string {
  return `${pattern.distinctQuestionCount} farklı soru · ${pattern.occurrenceCount} kayıt`;
}

/** The recovery fact, when there is one.
 *
 *  States the two things the evidence actually supports — that the same
 *  selection came up again, and that it was not taken — and stops there. It
 *  does not say the student now understands the idea, because a declined
 *  option is not a demonstrated one. */
export function choiceRecoveryFact(recovery: ChoiceRecoverySignal): string {
  return `Sonraki ${recovery.distinctQuestionCount} farklı soruda aynı seçim yeniden seçilmedi.`;
}

/** The short label beside a recovering pattern.
 *
 *  "Sinyal" is doing real work in this phrase. It is not "toparlandı" and not
 *  "çözüldü": the product is reporting something it noticed, not certifying an
 *  outcome, and the wording keeps that distance. */
export const CHOICE_RECOVERY_LABEL = "Toparlanma sinyali";

/** The label for a pattern with no recovery evidence yet. Descriptive, not a
 *  verdict — it names what the records show, not what the learner is. */
export const CHOICE_REPEATED_LABEL = "Tekrar eden seçim";

/** What an empty memory should say.
 *
 *  Two genuinely different situations, two different sentences. Neither is
 *  praise: "no repeated pattern" is not "no mistakes", and saying so would be
 *  both untrue and the kind of reassurance this product does not give. */
export function choicePatternAbsenceCopy(memory: VerifiedChoicePatternMemory): {
  title: string;
  description: string;
} {
  if (memory.semanticEventCount >= MIN_OCCURRENCES) {
    return {
      title: "Henüz tekrar eden bir seçim örüntüsü görünmüyor",
      description:
        "Son öğrenme kayıtlarında aynı seçim anlamı farklı sorularda tekrarlanmadı.",
    };
  }
  return {
    title: "Örüntü söylemek için daha fazla kayıt gerekiyor",
    description:
      "Şıklı sorularda çalıştıkça, farklı sorularda tekrar eden seçimler burada görünecek.",
  };
}
