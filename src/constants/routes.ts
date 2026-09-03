export const ROUTES = {
  login: "/(auth)/login",
  register: "/(auth)/register",
  forgotPassword: "/(auth)/forgot-password",
  verifyEmail: "/(auth)/verify-email",
  googleOnboarding: "/(auth)/google-onboarding",
  student: "/(student)/(tabs)",
  studentStudy: "/(student)/(tabs)/study",
  studentReviewSession: "/(student)/study/review",
  // Phase 28 — the free/adaptive round StudySessionScreen's completion
  // state transitions into after the mandatory round ("Çalışmaya Devam
  // Et"). A separate route (not a query param on studentReviewSession) so
  // the two are two distinct, unambiguous navigation targets.
  studentAdaptiveSession: "/(student)/study/adaptive",
  // Phase 70 — Öğrenme Haritam. Its own route rather than a Study Hub
  // section: the Hub answers "what should I do next", the map answers "where
  // does my learning evidence stand", and cramming the second into the first
  // would bury the next-action card the Hub exists to surface.
  studentConceptMasteryMap: "/(student)/study/mastery-map",
  editProfile: "/(student)/edit-profile",
  studentNotifications: "/(student)/notifications",
  teacher: "/(teacher)/(tabs)",
  teacherNotifications: "/(teacher)/notifications",
  admin: "/(admin)",
} as const;
