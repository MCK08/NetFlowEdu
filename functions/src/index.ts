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
} from "./social";
export {
  createClass,
  joinClassByCode,
  leaveClass,
  removeClassMember,
  regenerateClassJoinCode,
} from "./classes";

// Later phases will export from ./questions, ./review, and ./friends.
