export const ROUTES = {
  login: "/(auth)/login",
  register: "/(auth)/register",
  forgotPassword: "/(auth)/forgot-password",
  verifyEmail: "/(auth)/verify-email",
  googleOnboarding: "/(auth)/google-onboarding",
  student: "/(student)/(tabs)",
  editProfile: "/(student)/edit-profile",
  teacher: "/(teacher)/(tabs)",
  admin: "/(admin)",
} as const;
