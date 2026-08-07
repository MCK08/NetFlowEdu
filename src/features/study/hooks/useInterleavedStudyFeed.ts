import { useCallback, useEffect, useRef, useState } from "react";

import { computeReshowInsertIndex, pickReshowOffset } from "@features/classes/services/classFeedStudyGating";
import {
  FeedItem,
  reconcileFeedItems,
  reinjectPairForSecondChance,
} from "@features/classes/services/feedItems";
import { Question } from "@/types/question";

import { StudyOutcome } from "../domain/studyTypes";

interface UseInterleavedStudyFeedParams {
  // The base, server-ordered question list (from useSocialFeed / useClassFeed
  // — unchanged, still a plain paginated Question[]). This hook derives the
  // actual [Question, Rating, Question, Rating, ...] FlatList data from it
  // and never mutates it back.
  questions: Question[];
  // False for a teacher — no rating items are ever built (see
  // feedItems.ts's buildFeedItems `includeRating` doc comment), so their
  // feed is pure questions, same as before this phase existed.
  isStudent: boolean;
  scrollToIndex: (index: number) => void;
  // Phase 21 — optional. Changing this value starts a brand-new feed
  // session: `items` and the session-local reshow bookkeeping both reset,
  // instead of reconciling against what was there before. FeedScreen passes
  // a key derived from its active filter, so switching filters can never
  // carry a reshow pair for a question the new filter no longer includes
  // (reconcileFeedItems' own pagination/refresh contract deliberately DOES
  // preserve a reshow pair whose question temporarily drops out — see its
  // own doc comment — so a filter change needs this explicit reset rather
  // than weakening that guarantee). Omitted entirely by ClassFeedScreen,
  // which has no filter and keeps its exact pre-existing behavior.
  resetKey?: string | number;
}

// Phase 19.2 — replaces the overlay + scroll-prediction architecture
// entirely. The rating "screen" is now a real item in the FlatList's own
// data array (see feedItems.ts's module doc), so there is nothing left
// here to race: no gesture prediction, no drag refs, no shared "which
// question is being rated" state. `handleOutcomeRecorded` is called by a
// SPECIFIC, already-rendered RatingCard with its OWN `itemIndex` — that
// index came from FlatList's own renderItem call for that exact frame, so
// it is definitionally never stale.
//
// Shared verbatim by FeedScreen (the Akış tab) and ClassFeedScreen.
export function useInterleavedStudyFeed({
  questions,
  isStudent,
  scrollToIndex,
  resetKey,
}: UseInterleavedStudyFeedParams) {
  const [items, setItems] = useState<FeedItem[]>([]);
  // Session-local only, never persisted — see classFeedStudyGating.ts's
  // module doc for why the reshow itself deliberately never touches
  // Firestore.
  const reshownThisSessionRef = useRef<Set<string>>(new Set());
  const resetKeyRef = useRef(resetKey);

  // Phase 20 — `questions`' own order is the source of truth on every run,
  // not a length comparison against last time. A length-based diff assumed
  // growth only ever means "pagination appended more at the end", which is
  // false for an upload (prepended at the FRONT by useSocialFeed.prepend)
  // and false for a class-feed pull-to-refresh (replaces the whole list,
  // possibly reordered). Both silently duplicated one question's pair and
  // dropped another's. reconcileFeedItems rebuilds every normal pair fresh
  // from `questions` (correct for append/prepend/reorder/removal alike) and
  // carries forward any reshow pairs already spliced into the previous
  // `items` — see its own doc comment for exactly how.
  //
  // Phase 21 — a resetKey change (e.g. FeedScreen's active filter) is
  // handled BEFORE reconciling: it clears the reshow session bookkeeping
  // and reconciles against an EMPTY previous state, so no reshow pair from
  // the old session/filter can leak into the new one.
  useEffect(() => {
    const keyChanged = resetKeyRef.current !== resetKey;
    resetKeyRef.current = resetKey;
    if (keyChanged) reshownThisSessionRef.current = new Set();
    setItems((prev) => reconcileFeedItems(keyChanged ? [] : prev, questions, isStudent));
  }, [questions, isStudent, resetKey]);

  // Called by a RatingCard once ITS OWN mutation is confirmed successful
  // (see RatingCard's doc comment) — `itemIndex` is that card's own
  // position, straight from FlatList's renderItem for that render.
  const handleOutcomeRecorded = useCallback(
    (outcome: StudyOutcome, question: Question, itemIndex: number, questionIndex: number) => {
      if (outcome === "struggled" && !reshownThisSessionRef.current.has(question.id)) {
        setItems((prev) => {
          const insertIndex = computeReshowInsertIndex({
            currentIndex: itemIndex,
            totalLength: prev.length,
            offset: pickReshowOffset(),
            alreadyReshownThisSession: false,
          });
          if (insertIndex === null) return prev;
          reshownThisSessionRef.current.add(question.id);
          return reinjectPairForSecondChance(prev, question, questionIndex, insertIndex);
        });
      }
      // Deterministic — always the very next item, never predicted or
      // guessed. "Çözdüm" and "Zorlandım" both advance the same way; the
      // only difference is whether a reshow pair was just spliced in
      // somewhere further ahead.
      scrollToIndex(itemIndex + 1);
    },
    [scrollToIndex],
  );

  return { items, handleOutcomeRecorded };
}
