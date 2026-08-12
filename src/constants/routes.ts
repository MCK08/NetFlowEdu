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
  editProfile: "/(student)/edit-profile",
  studentNotifications: "/(student)/notifications",
  teacher: "/(teacher)/(tabs)",
  teacherNotifications: "/(teacher)/notifications",
  admin: "/(admin)",
} as const;
