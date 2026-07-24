import { ROUTES } from "@constants/routes";
import { resolveRouteForState } from "@features/authentication/services/routing";

describe("resolveRouteForState", () => {
  it("sends unauthenticated users to login", () => {
    expect(
      resolveRouteForState({ isAuthenticated: false, isEmailVerified: false, role: null }),
    ).toBe(ROUTES.login);
  });

  it("sends authenticated but unverified users to verify-email, regardless of role", () => {
    expect(
      resolveRouteForState({ isAuthenticated: true, isEmailVerified: false, role: "student" }),
    ).toBe(ROUTES.verifyEmail);
  });

  it("routes a verified student to the student dashboard", () => {
    expect(
      resolveRouteForState({ isAuthenticated: true, isEmailVerified: true, role: "student" }),
    ).toBe(ROUTES.student);
  });

  it("routes a verified teacher to the teacher dashboard", () => {
    expect(
      resolveRouteForState({ isAuthenticated: true, isEmailVerified: true, role: "teacher" }),
    ).toBe(ROUTES.teacher);
  });

  it("routes a verified organization_admin to the admin dashboard", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "organization_admin",
      }),
    ).toBe(ROUTES.admin);
  });

  it("routes a verified platform_admin to the admin dashboard", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "platform_admin",
      }),
    ).toBe(ROUTES.admin);
  });

  it("fails closed to /unknown-role when authenticated and verified but role is null", () => {
    expect(
      resolveRouteForState({ isAuthenticated: true, isEmailVerified: true, role: null }),
    ).toBe("/unknown-role");
  });

  // Regression coverage for the production bug: a verified teacher whose
  // completeOnboarding (Stage 2) never actually finished must not be routed
  // by `role` alone — `role` is still "student" (onUserCreate's default)
  // until Stage 2 promotes it, which previously sent such an account
  // straight into the student dashboard with no way back to a retry screen.
  it("routes a verified user back to verify-email when onboardingStatus is 'pending', regardless of role", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "student",
        onboardingStatus: "pending",
      }),
    ).toBe(ROUTES.verifyEmail);
  });

  it("routes a verified user back to verify-email when onboardingStatus is 'provisioning'", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "teacher",
        onboardingStatus: "provisioning",
      }),
    ).toBe(ROUTES.verifyEmail);
  });

  it("routes normally by role once onboardingStatus is 'complete'", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "teacher",
        onboardingStatus: "complete",
      }),
    ).toBe(ROUTES.teacher);
  });

  it("routes normally by role when onboardingStatus is omitted (legacy accounts, and every existing call site before this field existed)", () => {
    expect(
      resolveRouteForState({ isAuthenticated: true, isEmailVerified: true, role: "student" }),
    ).toBe(ROUTES.student);
  });

  it("an unverified user is sent to verify-email regardless of onboardingStatus", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: false,
        role: "student",
        onboardingStatus: "pending",
      }),
    ).toBe(ROUTES.verifyEmail);
  });
});
