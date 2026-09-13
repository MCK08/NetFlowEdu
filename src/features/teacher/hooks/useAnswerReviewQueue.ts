import {
  AnswerReviewDetail,
  AnswerReviewQueueItem,
  getAnswerReviewDetail,
  listAnswerReviewQueue,
  reviewAnswerSubmission,
} from "../services/answerReviewService";
import { reviewOutcomeCopy } from "../services/answerReviewCopy";
import { ReviewQueueServices, useReviewQueue } from "./useReviewQueue";

// Phase 97 — the class teacher's answer review queue. The behaviour lives in
// useReviewQueue (shared with Phase 98's comment queue); this binds it to the
// answer callables.
const ANSWER_REVIEW_SERVICES: ReviewQueueServices<AnswerReviewQueueItem, AnswerReviewDetail> = {
  list: listAnswerReviewQueue,
  detail: getAnswerReviewDetail,
  decide: reviewAnswerSubmission,
  outcomeCopy: reviewOutcomeCopy,
};

export function useAnswerReviewQueue(classId: string | undefined) {
  return useReviewQueue(classId, ANSWER_REVIEW_SERVICES);
}
