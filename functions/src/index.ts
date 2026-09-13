import { initializeApp } from "firebase-admin/app";

initializeApp();

export { onUserCreate } from "./triggers";
export { adminSetUserRole } from "./admin";
// requestTeacherRole is no longer called from anywhere in the app — the
// registration flow now finalizes the teacher role directly via
// completeOnboarding. Left deployed/exported rather than deleted; see the
// Phase 8 onboarding completion report for the full list of now-unreachable
// files this leaves behind.
export { requestTeacherRole } from "./teacherRequests";
export { initializeOnboarding, completeOnboarding } from "./onboarding";
export { setUsername } from "./users";
export { onAnswerCreate } from "./answers";
export { syncPublicProfile } from "./profiles";
export {
  toggleQuestionLike,
  toggleAnswerLike,
  onQuestionCommentCreate,
  onQuestionCommentDelete,
  // Phase 93 — the authoritative comment delete. Create has been server-only
  // since Phase 17; this is the other half of the same lifecycle.
  deleteQuestionComment,
} from "./social";
export {
  createClass,
  joinClassByCode,
  leaveClass,
  removeClassMember,
  regenerateClassJoinCode,
} from "./classes";
export {
  sendFriendRequest,
  respondToFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from "./friends";
export { markAllNotificationsRead, markNotificationRead } from "./notifications";
export { recordStudyOutcome, setStudyDailyGoal, removeStudyItem } from "./study";
export { submitQuestionCommentForModeration, submitAnswerForModeration } from "./moderation";
// Phase 88 — the authoritative question-revision gateway. Client writes to a
// question's authoring fields are denied by firestore.rules; this is the path.
// Phase 89 — question creation is server-authoritative too; firestore.rules
// deny a client create outright, so this is the only way a question begins.
export { createQuestion, updateQuestionRevision } from "./questions";
// Phase 97 — the human half of answer publication. manual_review is resolved
// by the submission's class teacher and by no one else; see review/answerReview.ts.
export { listAnswerReviewQueue, getAnswerReviewDetail, reviewAnswerSubmission } from "./review";
