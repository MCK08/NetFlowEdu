import { initializeApp } from "firebase-admin/app";

initializeApp();

export { onUserCreate } from "./triggers";
export { adminSetUserRole } from "./admin";
export { requestTeacherRole } from "./teacherRequests";
export { setUsername } from "./users";

// Later phases will export from ./questions, ./review, ./leaderboards,
// ./classes, and ./friends.
