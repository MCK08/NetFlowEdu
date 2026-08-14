import { getClassQuestionsPage } from "@services/questions/questions";
import { Question } from "@/types/question";

import { countEligibleQuestions, QuestionSelectionCriteria } from "./smartAssignmentSelection";

// One bounded page's worth (matches the class's own question grid page
// size — see useClassQuestions.ts). Kept small per fetch so a class with
// FEW matching questions never pays for more than it needs.
export const QUESTION_POOL_PAGE_SIZE = 100;
// Fetches at most this many pages (so at most 300 questions total) before
// giving up and reporting whatever was actually found — real pagination,
// but still a hard, small ceiling, never "the whole class history" (§13's
// own explicit prohibition on unbounded reads).
export const MAX_QUESTION_POOL_PAGES = 3;

// Extracted from useCreateAssignment so the pagination LOOP itself (stop
// early once enough eligible questions are found; never exceed the page
// ceiling; never duplicate across pages) is testable via mocking
// getClassQuestionsPage — the exact same "async service, tested by
// mocking the Firestore call" pattern socialFeedService.ts's
// loadNextFeedPage already established, since a real network fetch can't
// be a pure function.
export async function fetchAssignmentQuestionPool(
  classId: string,
  criteria: QuestionSelectionCriteria,
  requestedCount: number,
): Promise<Question[]> {
  let cursor: Parameters<typeof getClassQuestionsPage>[2] = null;
  let pool: Question[] = [];

  for (let page = 0; page < MAX_QUESTION_POOL_PAGES; page += 1) {
    const result = await getClassQuestionsPage(classId, QUESTION_POOL_PAGE_SIZE, cursor);
    // getClassQuestionsPage's own cursor never re-returns an already-seen
    // document (Firestore startAfter semantics), so a plain concat here
    // can never duplicate a question across pages.
    pool = pool.concat(result.questions);
    const eligibleCount = countEligibleQuestions(pool, criteria);
    if (eligibleCount >= requestedCount || !result.hasMore) break;
    cursor = result.cursor;
  }

  return pool;
}
