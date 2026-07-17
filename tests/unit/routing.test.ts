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
});
