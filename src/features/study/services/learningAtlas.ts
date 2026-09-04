import {
  LearningEvent,
  MAX_TRAIL_EVENTS,
  selectTopicTrail,
} from "@features/learningStory/services/learningTrail";

import {
  buildConceptMasteryMap,
  ConceptNode,
  conceptReviewNote,
  conceptStateLabel,
  conceptSupportingFact,
} from "./conceptMasteryMap";
import { LearningInsightItem } from "./learningInsights";
import { StudentNextAction } from "./studentNextAction";
import {
  buildStrugglePatternMemory,
  StrugglePatternKind,
} from "./strugglePatternMemory";

// Phase 76 — the Learning Atlas: one place the student can see how the
// signals the product already trusts sit together right now.
//
// WHAT THIS IS
//
// A COMPOSITION layer. Every meaning on this screen is carried in from a
// module that already owns it:
//
//   concepts and their state   Phase 70  buildConceptMasteryMap
//   repeated-struggle patterns Phase 71  buildStrugglePatternMemory
//   ordered learning motion    Phase 59  selectTopicTrail over studyEvents
//   review readiness           Phase 62  via ConceptNode.dueCount
//   what to do now             Daily Flow resolveStudentNextAction
//
// WHAT THIS IS NOT
//
// Not a classifier. Nothing here decides what a question's history means —
// Phase 42 does, through Phase 70. `AtlasLens` is a filter over presentation
// values that already exist; it introduces no new state and renames none.
//
// Not a scheduler. Due-ness is `ConceptNode.dueCount`, which is the server's
// `nextReviewAt` verdict plus Phase 62's mastery gate. This file contains no
// threshold and no interval.
//
// Not a scoring system. No percentage, no score, no risk level, no momentum,
// no velocity. Grep this file for `%` and there is nothing to find.
//
// Not a curriculum graph. The repository contains no authored prerequisite
// metadata of any kind — no `prerequisite`, `dependsOn`, `parentConcept` or
// `conceptGraph` field exists on a question or anywhere else. The Atlas
// therefore models NO relationship between concepts beyond "these share a
// subject". Its visual connectors are decorative grouping, and the domain
// model deliberately exposes no edge type at all, so a future screen cannot
// accidentally render one as a dependency.

/** A way of looking at the same verified evidence. A FILTER, never a verdict:
 *  each lens selects among presentation values Phase 70 already assigned. */
export type AtlasLens = "all" | "struggle" | "recovery" | "review";

export const ATLAS_LENSES: readonly AtlasLens[] = ["all", "struggle", "recovery", "review"];

/** Student-facing lens names. Short by design — this is a perspective switch,
 *  not a taxonomy the student has to learn. */
const LENS_LABEL: Readonly<Record<AtlasLens, string>> = {
  all: "Genel",
  struggle: "Zorlanma",
  recovery: "Toparlanma",
  review: "Tekrar",
};

export function atlasLensLabel(lens: AtlasLens): string {
  return LENS_LABEL[lens];
}

export interface AtlasNode {
  /** Phase 70's key, unchanged: `subject|topic`. */
  id: string;
  subject: string;
  topic: string;
  /** Phase 70's verdict, carried rather than copied or re-derived. */
  concept: ConceptNode;
  /** Phase 70's own wording for that verdict. */
  stateLabel: string;
  /** Phase 70's one supporting fact. */
  fact: string;
  /** Phase 70's review line, or null when the scheduler has released nothing. */
  reviewNote: string | null;
  isDue: boolean;
  /** True only when the canonical next action genuinely names THIS concept. */
  isFocus: boolean;
  /** Phase 71's pattern kind for this topic, when it produced one. Null is
   *  "no pattern was surfaced", NOT "no difficulty exists" — Phase 71 caps how
   *  many patterns it reports, and that cap is respected rather than widened. */
  patternKind: StrugglePatternKind | null;
  /** Real ordered outcomes for this topic from the bounded Phase 59 window,
   *  oldest → newest. Empty when the window holds none. Never derived from
   *  cumulative counters, which carry no order at all. */
  motion: readonly LearningEvent[];
}

export interface AtlasRegion {
  subject: string;
  nodes: AtlasNode[];
}

/** What the product is pointing at right now, restated for the Atlas. */
export interface AtlasFocus {
  label: string;
  title: string;
  detail: string;
  /** The concept this action is about — set ONLY when the canonical action
   *  actually names a subject and topic AND that concept exists as a node.
   *  Null for every action that does not (a due-review batch, adaptive
   *  practice over legacy questions, a goal top-up, nothing to do). Attaching
   *  a node in those cases would be the Atlas inventing a focus the product
   *  never chose. */
  conceptId: string | null;
}

export interface LearningAtlas {
  focus: AtlasFocus | null;
  regions: AtlasRegion[];
  /** How many nodes each lens would show, so the control can be honest about
   *  an empty perspective before the student taps it. */
  lensCounts: Readonly<Record<AtlasLens, number>>;
  totalConcepts: number;
  conceptsDue: number;
  conceptsNeedingAttention: number;
  isEmpty: boolean;
  /** True when the bounded Phase 59 window returned nothing at all, so every
   *  node's motion is absent for the same reason. Lets the screen say so once
   *  instead of repeating "no recent record" on every concept. */
  hasNoRecentMotion: boolean;
}

/** Which lenses a node belongs to.
 *
 *  Struggle deliberately includes `watch` alongside `needs_attention`: both
 *  are real struggle evidence, and each node carries Phase 70's own label, so
 *  a one-off reads as "Tek zorlanma görüldü" and can never be mistaken for
 *  repetition. Excluding it would hide real evidence; relabelling it would
 *  overstate it.
 *
 *  Recovery is Phase 42's `recovering` verdict only, surfaced through Phase
 *  70's presentation. A trail that merely ends on a solve is NOT recovery. */
function matchesLens(node: AtlasNode, lens: AtlasLens): boolean {
  switch (lens) {
    case "struggle":
      return (
        node.concept.presentation === "needs_attention" ||
        node.concept.presentation === "watch"
      );
    case "recovery":
      return node.concept.presentation === "recovering";
    case "review":
      return node.isDue;
    case "all":
    default:
      return true;
  }
}

export function filterAtlasRegions(
  regions: readonly AtlasRegion[],
  lens: AtlasLens,
): AtlasRegion[] {
  if (lens === "all") return regions.map((region) => ({ ...region }));
  const filtered: AtlasRegion[] = [];
  for (const region of regions) {
    const nodes = region.nodes.filter((node) => matchesLens(node, lens));
    if (nodes.length > 0) filtered.push({ subject: region.subject, nodes });
  }
  return filtered;
}

/** The concept the canonical next action is about, or null.
 *
 *  Only two of the six action kinds carry a subject AND a topic. The other
 *  four say so themselves: a due-review batch spans topics, adaptive practice
 *  is explicitly the case where no honest topic name exists, a goal top-up
 *  names no topic, and "no action" names nothing. Guessing one for them would
 *  be exactly the fabrication this module exists to avoid. */
function resolveFocusConceptId(action: StudentNextAction): string | null {
  if (action.kind !== "continue_assignment" && action.kind !== "struggled_topic") {
    return null;
  }
  const subject = action.subject.trim();
  const topic = action.topic.trim();
  if (!subject || !topic) return null;
  return `${subject}|${topic}`;
}

export interface BuildLearningAtlasParams {
  items: readonly LearningInsightItem[];
  /** The bounded Phase 59 window. Empty is a valid, meaningful input. */
  events: readonly LearningEvent[];
  /** The canonical Daily Flow decision, or null when it is not resolved yet. */
  nextAction: StudentNextAction | null;
  /** Copy for that action, produced by the caller through the SAME
   *  nextActionCopy the Study Hub uses — passed in rather than re-derived, so
   *  the Atlas can never drift into a second wording of the same decision. */
  focusCopy: { label: string; title: string; detail: string } | null;
  now: number;
}

/** Composes the Atlas.
 *
 *  Cost is O(i + e + c log c): one pass over study items (inside Phase 70),
 *  one pass over events to bucket them by concept, then the per-subject sorts
 *  Phase 70 already does. No concept re-scans the event list, and nothing here
 *  queries anything — every input is already in memory on the caller. */
export function buildLearningAtlas(params: BuildLearningAtlasParams): LearningAtlas {
  const map = buildConceptMasteryMap({ items: params.items, now: params.now });

  // One pass, so a concept looks its motion up instead of filtering the whole
  // window again. selectTopicTrail is still what does the ordering and the
  // capping — the bucket only narrows what it has to look at, so the semantics
  // (exact subject+topic match, oldest→newest, capped) stay Phase 59's.
  const eventsByConcept = new Map<string, LearningEvent[]>();
  for (const event of params.events) {
    if (!event.subject || !event.topic) continue;
    const key = `${event.subject}|${event.topic}`;
    const bucket = eventsByConcept.get(key);
    if (bucket) bucket.push(event);
    else eventsByConcept.set(key, [event]);
  }

  // Phase 71's own engine, not a second one. Its cap on how many patterns it
  // reports is respected: a topic without an entry here simply had no pattern
  // surfaced, which the node type documents.
  const memory = buildStrugglePatternMemory({ items: params.items, events: params.events });
  const patternByConcept = new Map<string, StrugglePatternKind>();
  for (const pattern of memory.patterns) {
    const key = `${pattern.subject}|${pattern.topic}`;
    if (!patternByConcept.has(key)) patternByConcept.set(key, pattern.kind);
  }

  const focusConceptId = params.nextAction ? resolveFocusConceptId(params.nextAction) : null;

  const regions: AtlasRegion[] = [];
  const lensCounts: Record<AtlasLens, number> = { all: 0, struggle: 0, recovery: 0, review: 0 };
  let focusExists = false;

  for (const region of map.subjects) {
    const nodes: AtlasNode[] = [];
    for (const concept of region.concepts) {
      const isFocus = concept.id === focusConceptId;
      if (isFocus) focusExists = true;

      const node: AtlasNode = {
        id: concept.id,
        subject: concept.subject,
        topic: concept.topic,
        concept,
        stateLabel: conceptStateLabel(concept),
        fact: conceptSupportingFact(concept),
        reviewNote: conceptReviewNote(concept),
        isDue: concept.dueCount > 0,
        isFocus,
        patternKind: patternByConcept.get(concept.id) ?? null,
        motion: selectTopicTrail(
          eventsByConcept.get(concept.id) ?? [],
          concept.subject,
          concept.topic,
        ),
      };

      nodes.push(node);
      for (const lens of ATLAS_LENSES) {
        if (matchesLens(node, lens)) lensCounts[lens] += 1;
      }
    }
    regions.push({ subject: region.subject, nodes });
  }

  return {
    // The focus keeps its canonical copy even when no node matches — the
    // action is still what the product is pointing at. Only the ATTACHMENT to
    // a concept is dropped, which is the part that would have been invented.
    focus:
      params.focusCopy && params.nextAction
        ? { ...params.focusCopy, conceptId: focusExists ? focusConceptId : null }
        : null,
    regions,
    lensCounts,
    totalConcepts: map.totalConcepts,
    conceptsDue: map.conceptsDueForReview,
    conceptsNeedingAttention: map.conceptsNeedingAttention,
    isEmpty: map.isEmpty,
    hasNoRecentMotion: params.events.length === 0,
  };
}

/** The one line under the Atlas title. Counts of concepts, never a share or a
 *  rate, and only the parts that are actually true. */
export function atlasSummaryFacts(atlas: LearningAtlas): string[] {
  const facts: string[] = [];
  if (atlas.totalConcepts > 0) facts.push(`${atlas.totalConcepts} konu`);
  if (atlas.conceptsNeedingAttention > 0) {
    facts.push(`${atlas.conceptsNeedingAttention} konuda tekrar eden zorlanma`);
  }
  if (atlas.conceptsDue > 0) facts.push(`${atlas.conceptsDue} konuda tekrar zamanı`);
  return facts;
}

/** What an empty lens should say. Each sentence states what was actually
 *  looked for, so "no repeated struggle right now" never reads as praise and
 *  never reads as an error. */
export function atlasEmptyLensCopy(lens: AtlasLens): string {
  switch (lens) {
    case "struggle":
      return "Şu anda zorlanma kanıtı olan bir konu görünmüyor.";
    case "recovery":
      return "Şu anda toparlanma kanıtı olan bir konu görünmüyor.";
    case "review":
      return "Şu anda tekrar zamanı gelen bir konu yok.";
    case "all":
    default:
      return "Çalıştıkça öğrenme atlasın burada oluşacak.";
  }
}

/** The motion caption. Deliberately names the WINDOW, because Phase 59's query
 *  is bounded — the Atlas may never imply it has seen a student's whole
 *  history. */
export const ATLAS_MOTION_CAPTION = "Son öğrenme kayıtlarında";

export const ATLAS_MAX_MOTION_STEPS = MAX_TRAIL_EVENTS;
