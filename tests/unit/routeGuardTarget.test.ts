import { ROUTES } from "@constants/routes";
import { isAtTarget } from "@features/authentication/services/routeTarget";

// Regression test for the "app stuck forever on the loading screen" bug:
// isAtTarget's group-extraction regex previously required the target
// string to start with "(" at position 0, but every ROUTES value actually
// starts with a leading "/" before the group (e.g. "/(auth)/login"). That
// mismatch made isAtTarget always return false, so RouteGuard's effect
// called router.replace() on every single run, forever, for every route —
// an infinite redirect loop that never let anything render past the splash
// overlay, regardless of auth state.
describe("isAtTarget", () => {
  it("recognizes already being inside the login group", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "login"])).toBe(true);
  });

  it("recognizes already being inside the register/forgot-password screens (same group)", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "register"])).toBe(true);
  });

  it("recognizes already being inside the student group, including a nested tab/screen", () => {
    expect(isAtTarget(ROUTES.student, ["(student)", "(tabs)", "profile"])).toBe(true);
  });

  it("recognizes already being inside the teacher group", () => {
    expect(isAtTarget(ROUTES.teacher, ["(teacher)", "class", "abc"])).toBe(true);
  });

  it("recognizes already being inside the admin group", () => {
    expect(isAtTarget(ROUTES.admin, ["(admin)"])).toBe(true);
  });

  it("recognizes NOT being at the target when in a different group", () => {
    expect(isAtTarget(ROUTES.teacher, ["(student)", "(tabs)"])).toBe(false);
  });

  it("requires the exact verify-email path, not just the (auth) group", () => {
    expect(isAtTarget(ROUTES.verifyEmail, ["(auth)", "verify-email"])).toBe(true);
    expect(isAtTarget(ROUTES.verifyEmail, ["(auth)", "login"])).toBe(false);
  });

  it("recognizes the unknown-role screen", () => {
    expect(isAtTarget("/unknown-role", ["unknown-role"])).toBe(true);
    expect(isAtTarget("/unknown-role", ["(student)", "(tabs)"])).toBe(false);
  });

  it("never reports 'already there' for an empty/root segments array against a group target", () => {
    expect(isAtTarget(ROUTES.student, [])).toBe(false);
  });
});
