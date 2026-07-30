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

  // Regression coverage for the production bug: a just-promoted teacher was
  // routed into the teacher dashboard the instant Firestore's realtime
  // listener reported onboardingStatus "complete" — a signal that reliably
  // arrives BEFORE this client's own ID token is force-refreshed with the
  // new role/organizationId custom claims (two independent network
  // round-trips, no ordering guarantee between them). The very first
  // createClass call then failed with a stale token, surfaced to the user
  // as "Sınıf oluşturulamadı." claimsSynced closes this race: it must hold
  // the user on verify-email even once onboardingStatus is "complete",
  // until the client's own refresh is confirmed.
  it("holds a user on verify-email when onboardingStatus is 'complete' but claimsSynced is explicitly false (the exact race window)", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "teacher",
        onboardingStatus: "complete",
        claimsSynced: false,
      }),
    ).toBe(ROUTES.verifyEmail);
  });

  it("routes normally by role once onboardingStatus is 'complete' AND claimsSynced is true", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "teacher",
        onboardingStatus: "complete",
        claimsSynced: true,
      }),
    ).toBe(ROUTES.teacher);
  });

  it("defaults claimsSynced to true when omitted — every call site before this field existed keeps working unchanged", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "teacher",
        onboardingStatus: "complete",
      }),
    ).toBe(ROUTES.teacher);
  });

  it("claimsSynced false has no effect while onboardingStatus is still 'provisioning' (already routed to verify-email for that reason)", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "teacher",
        onboardingStatus: "provisioning",
        claimsSynced: false,
      }),
    ).toBe(ROUTES.verifyEmail);
  });

  // Regression coverage for the "Çıkış Yap" button appearing to do nothing:
  // once signed out, !isAuthenticated must win outright — a pending teacher
  // account's onboardingStatus/claimsSynced must never pull them back onto
  // verify-email after a successful sign-out, which would look identical to
  // "logout didn't do anything" even though Firebase Auth itself succeeded.
  it("sends a signed-out user to login even if they were a pending teacher with claimsSynced false — logout is never overridden by onboarding state", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: false,
        isEmailVerified: false,
        role: "teacher",
        onboardingStatus: "pending",
        claimsSynced: false,
      }),
    ).toBe(ROUTES.login);
  });

  // Feature 3 (Google Sign In): a brand-new Google sign-up has no
  // requestedRole yet (Stage 1 onboarding hasn't run), so it must be
  // diverted to the dedicated onboarding screen instead of verify-email.
  it("routes a pending user with hasRequestedRole false to googleOnboarding", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "student",
        onboardingStatus: "pending",
        hasRequestedRole: false,
      }),
    ).toBe(ROUTES.googleOnboarding);
  });

  it("routes a pending user with hasRequestedRole omitted to verify-email (every existing call site before this field existed)", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "student",
        onboardingStatus: "pending",
      }),
    ).toBe(ROUTES.verifyEmail);
  });

  it("routes a pending user with hasRequestedRole true to verify-email, not googleOnboarding", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "student",
        onboardingStatus: "pending",
        hasRequestedRole: true,
      }),
    ).toBe(ROUTES.verifyEmail);
  });

  it("routes a provisioning user to verify-email even when hasRequestedRole is false (only 'pending' diverts to googleOnboarding)", () => {
    expect(
      resolveRouteForState({
        isAuthenticated: true,
        isEmailVerified: true,
        role: "student",
        onboardingStatus: "provisioning",
        hasRequestedRole: false,
      }),
    ).toBe(ROUTES.verifyEmail);
  });
});
