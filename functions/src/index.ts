import { initializeApp } from "firebase-admin/app";

initializeApp();

export { onUserCreate } from "./triggers";
export { adminSetUserRole } from "./admin";

// Later phases will export from ./questions, ./review, ./leaderboards,
// ./classes, and ./friends.
