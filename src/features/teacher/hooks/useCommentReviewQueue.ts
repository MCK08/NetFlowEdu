import {
  CommentReviewDetail,
  CommentReviewQueueItem,
  getCommentReviewDetail,
  listCommentReviewQueue,
  reviewCommentSubmission,
} from "../services/commentReviewService";
import { commentReviewOutcomeCopy } from "../services/answerReviewCopy";
import { ReviewQueueServices, useReviewQueue } from "./useReviewQueue";

// Phase 98 — the class teacher's comment review queue, bound to the comment
// callables. Same pending-work behaviour as the answer queue.
const COMMENT_REVIEW_SERVICES: ReviewQueueServices<CommentReviewQueueItem, CommentReviewDetail> = {
  list: listCommentReviewQueue,
  detail: getCommentReviewDetail,
  decide: reviewCommentSubmission,
  outcomeCopy: commentReviewOutcomeCopy,
};

export function useCommentReviewQueue(classId: string | undefined) {
  return useReviewQueue(classId, COMMENT_REVIEW_SERVICES);
}
