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
  // Phase 71 — Zorlanma Örüntülerim. Reached from the Concept Map rather than
  // Study Hub: the map says where evidence stands, this says how difficulty is
  // repeating, and the Hub already carries four competing entry points.
  studentStrugglePatterns: "/(student)/study/patterns",
  // Phase 76 — Öğrenme Atlasım. The Hub's single exploration entry: it
  // composes the concept map, the struggle patterns, the bounded chronology
  // and the canonical next action into one landscape, and routes into the
  // deeper screens rather than replacing them.
  studentLearningAtlas: "/(student)/study/learning-atlas",
  editProfile: "/(student)/edit-profile",
  studentNotifications: "/(student)/notifications",
  teacher: "/(teacher)/(tabs)",
  teacherNotifications: "/(teacher)/notifications",
  admin: "/(admin)",
} as const;
