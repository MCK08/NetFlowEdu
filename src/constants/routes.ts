export const ROUTES = {
  login: "/(auth)/login",
  register: "/(auth)/register",
  forgotPassword: "/(auth)/forgot-password",
  verifyEmail: "/(auth)/verify-email",
  student: "/(student)/(tabs)",
  editProfile: "/(student)/edit-profile",
  teacher: "/(teacher)",
  admin: "/(admin)",
} as const;
