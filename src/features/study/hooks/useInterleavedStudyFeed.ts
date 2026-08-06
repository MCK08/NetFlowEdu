import { useCallback, useEffect, useRef, useState } from "react";

import { computeReshowInsertIndex, pickReshowOffset } from "@features/classes/services/classFeedStudyGating";
import { buildFeedItems, FeedItem, reinjectPairForSecondChance } from "@features/classes/services/feedItems";
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
}: UseInterleavedStudyFeedParams) {
  const [items, setItems] = useState<FeedItem[]>(() => buildFeedItems(questions, 0, isStudent));
  // How many of `questions` have already been interleaved into `items` —
  // lets a newly-loaded page APPEND only its own new pairs (preserving any
  // reshow splices already in `items`) instead of rebuilding everything.
  const interleavedCountRef = useRef(questions.length);
  // Session-local only, never persisted — see classFeedStudyGating.ts's
  // module doc for why the reshow itself deliberately never touches
  // Firestore.
  const reshownThisSessionRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (questions.length > interleavedCountRef.current) {
      // Pagination appended more questions — interleave only the new tail.
      const newQuestions = questions.slice(interleavedCountRef.current);
      const newItems = buildFeedItems(newQuestions, interleavedCountRef.current, isStudent);
      interleavedCountRef.current = questions.length;
      setItems((prev) => [...prev, ...newItems]);
    } else if (questions.length < interleavedCountRef.current) {
      // A refresh/reset replaced the list with a shorter one — rebuild
      // from scratch; there is nothing valid left to append onto.
      interleavedCountRef.current = questions.length;
      setItems(buildFeedItems(questions, 0, isStudent));
    }
  }, [questions, isStudent]);

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
