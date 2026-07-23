import { DocumentData, DocumentSnapshot } from "firebase/firestore";

import {
  getOwnQuestionsPage,
  getPublicQuestionsPage,
  QuestionPage,
} from "@services/questions/questions";
import { Question } from "@/types/question";

export const FEED_PAGE_SIZE = 10;

export type FeedPhase = "own" | "public" | "done";

export interface FeedCursorState {
  phase: FeedPhase;
  ownCursor: DocumentSnapshot<DocumentData> | null;
  publicCursor: DocumentSnapshot<DocumentData> | null;
}

export const INITIAL_FEED_CURSOR_STATE: FeedCursorState = {
  phase: "own",
  ownCursor: null,
  publicCursor: null,
};

export interface FeedPageResult {
  questions: Question[];
  nextState: FeedCursorState;
}

// Feed priority (see ROADMAP/ARCHITECTURE): a user's own questions first,
// then everyone else's public questions. Class questions are excluded —
// there's no real membership check yet (see firestore.rules), so nothing
// is queried for that visibility rather than faking it.
//
// Two independent, rules-safe queries (never one broad query mixing
// visibilities — Firestore can't prove that safe against the rules) are
// paginated as sequential *phases* rather than interleaved by date: once
// "own" is exhausted, "public" begins. This is simpler and more robust
// than merging two cursors while still matching the required priority
// order exactly. `seenIds` (threaded through by the caller) deduplicates
// the case where one of the user's own questions is also public — it
// would otherwise appear once in each phase.
export async function loadNextFeedPage(
  uid: string,
  state: FeedCursorState,
  seenIds: Set<string>,
): Promise<FeedPageResult> {
  if (state.phase === "own") {
    const page: QuestionPage = await getOwnQuestionsPage(uid, FEED_PAGE_SIZE, state.ownCursor);
    const fresh = page.questions.filter((q) => !seenIds.has(q.id));
    fresh.forEach((q) => seenIds.add(q.id));

    return {
      questions: fresh,
      nextState: {
        phase: page.hasMore ? "own" : "public",
        ownCursor: page.cursor,
        publicCursor: state.publicCursor,
      },
    };
  }

  if (state.phase === "public") {
    const page: QuestionPage = await getPublicQuestionsPage(FEED_PAGE_SIZE, state.publicCursor);
    const fresh = page.questions.filter((q) => !seenIds.has(q.id));
    fresh.forEach((q) => seenIds.add(q.id));

    return {
      questions: fresh,
      nextState: {
        phase: page.hasMore ? "public" : "done",
        ownCursor: state.ownCursor,
        publicCursor: page.cursor,
      },
    };
  }

  return { questions: [], nextState: state };
}
