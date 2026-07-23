import { initializeApp } from "firebase-admin/app";

initializeApp();

export { onUserCreate } from "./triggers";
export { adminSetUserRole } from "./admin";
export { requestTeacherRole } from "./teacherRequests";
export { setUsername } from "./users";
export { onAnswerCreate } from "./answers";
export { syncPublicProfile } from "./profiles";
export {
  toggleQuestionLike,
  toggleAnswerLike,
  onQuestionCommentCreate,
  onQuestionCommentDelete,
} from "./social";

// Later phases will export from ./questions, ./review, ./leaderboards,
// ./classes, and ./friends.
