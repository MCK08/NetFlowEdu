export const ROUTES = {
  login: "/(auth)/login",
  register: "/(auth)/register",
  forgotPassword: "/(auth)/forgot-password",
  verifyEmail: "/(auth)/verify-email",
  googleOnboarding: "/(auth)/google-onboarding",
  student: "/(student)/(tabs)",
  editProfile: "/(student)/edit-profile",
  studentNotifications: "/(student)/notifications",
  teacher: "/(teacher)/(tabs)",
  teacherNotifications: "/(teacher)/notifications",
  admin: "/(admin)",
} as const;
