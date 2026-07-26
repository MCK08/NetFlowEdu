import { ROUTES } from "@constants/routes";
import {
  isAtAnyTarget,
  isAtTarget,
  PUBLIC_AUTH_ROUTES,
} from "@features/authentication/services/routeTarget";

// Regression test for the "app stuck forever on the loading screen" bug:
// isAtTarget's group-extraction regex previously required the target
// string to start with "(" at position 0, but every ROUTES value actually
// starts with a leading "/" before the group (e.g. "/(auth)/login"). That
// mismatch made isAtTarget always return false, so RouteGuard's effect
// called router.replace() on every single run, forever, for every route —
// an infinite redirect loop that never let anything render past the splash
// overlay, regardless of auth state.
describe("isAtTarget", () => {
  it("recognizes already being at the exact login screen", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "login"])).toBe(true);
  });

  // Regression test for the real-device bug: this used to assert `true` —
  // treating "on the register screen" as already satisfying "target: login"
  // because both live in the (auth) group. That's what made RouteGuard skip
  // router.replace(login) after a successful signOut() from register,
  // forgot-password, or verify-email: it believed the user was "already
  // there." The (auth) group's screens are NOT interchangeable like
  // (student)/(teacher)/(admin)'s are — login now requires an exact match.
  it("does NOT treat register/forgot-password/verify-email as already being at login — the (auth) group's screens are distinct, unlike (student)/(teacher)/(admin)", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "register"])).toBe(false);
    expect(isAtTarget(ROUTES.login, ["(auth)", "forgot-password"])).toBe(false);
    expect(isAtTarget(ROUTES.login, ["(auth)", "verify-email"])).toBe(false);
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

  // End-to-end proof of the real-device fix: a user sitting on verify-email
  // who signs out (isAuthenticated flips false) must actually be routed to
  // login, not left stranded because RouteGuard thought "(auth)" already
  // satisfied the login target.
  it("a signed-out user sitting on verify-email is NOT considered already at the login target — RouteGuard must actually navigate", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "verify-email"])).toBe(false);
  });

  it("once actually on the login screen, RouteGuard correctly stops re-navigating (no infinite loop reintroduced by the fix)", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "login"])).toBe(true);
  });
});

// Regression test for the "Kayıt Ol butonuna basınca hiçbir şey olmuyor"
// real-device bug: making login exact-match (previous turn) fixed the
// signOut-from-verify-email bug but broke navigation to register/
// forgot-password for an unauthenticated user, because
// resolveRouteForState always resolves to the single literal ROUTES.login
// and isAtTarget(login, register-segments) is correctly false. Every
// (auth)-group screen must be pairwise exact-match/mutually exclusive
// against every other, general enough to cover any future auth screen
// added to EXACT_MATCH_AUTH_ROUTES — while (student)/(teacher)/(admin)'s
// existing group-based "any sub-screen counts as arrived" behavior must be
// completely unaffected.
describe("isAtTarget — (auth) group screens are pairwise mutually exclusive", () => {
  it("login → register is false", () => {
    expect(isAtTarget(ROUTES.register, ["(auth)", "login"])).toBe(false);
  });

  it("register → login is false", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "register"])).toBe(false);
  });

  it("login → forgot-password is false", () => {
    expect(isAtTarget(ROUTES.forgotPassword, ["(auth)", "login"])).toBe(false);
  });

  it("forgot-password → login is false", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "forgot-password"])).toBe(false);
  });

  it("verify-email → login is false", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "verify-email"])).toBe(false);
  });

  it("login → verify-email is false", () => {
    expect(isAtTarget(ROUTES.verifyEmail, ["(auth)", "login"])).toBe(false);
  });

  it("register → forgot-password is false", () => {
    expect(isAtTarget(ROUTES.forgotPassword, ["(auth)", "register"])).toBe(false);
  });

  it("register → register is true", () => {
    expect(isAtTarget(ROUTES.register, ["(auth)", "register"])).toBe(true);
  });

  it("login → login is true", () => {
    expect(isAtTarget(ROUTES.login, ["(auth)", "login"])).toBe(true);
  });

  it("forgot-password → forgot-password is true", () => {
    expect(isAtTarget(ROUTES.forgotPassword, ["(auth)", "forgot-password"])).toBe(true);
  });

  it("verify-email → verify-email is true", () => {
    expect(isAtTarget(ROUTES.verifyEmail, ["(auth)", "verify-email"])).toBe(true);
  });

  // Non-regression: (student)/(teacher)/(admin) must keep their existing
  // group-based behavior — untouched by the (auth)-group exact-match list.
  it("student group's sub-screens still count as arrived (unaffected by the auth-group fix)", () => {
    expect(isAtTarget(ROUTES.student, ["(student)", "(tabs)", "profile"])).toBe(true);
    expect(isAtTarget(ROUTES.student, ["(student)", "edit-profile"])).toBe(true);
  });

  it("teacher group's sub-screens still count as arrived (unaffected by the auth-group fix)", () => {
    expect(isAtTarget(ROUTES.teacher, ["(teacher)", "class", "xyz"])).toBe(true);
  });

  it("admin group's sub-screens still count as arrived (unaffected by the auth-group fix)", () => {
    expect(isAtTarget(ROUTES.admin, ["(admin)", "index"])).toBe(true);
  });
});

// Regression test for the real fix that makes register/forgot-password
// actually navigable: RouteGuard treats these (plus login itself) as
// acceptable resting places for an unauthenticated user, without needing
// isAtTarget(login, ...) to be true for them.
describe("PUBLIC_AUTH_ROUTES / isAtAnyTarget — RouteGuard's unauthenticated allowance", () => {
  it("includes login, register, and forgot-password", () => {
    expect(PUBLIC_AUTH_ROUTES).toEqual(
      expect.arrayContaining([ROUTES.login, ROUTES.register, ROUTES.forgotPassword]),
    );
  });

  it("deliberately excludes verify-email — losing auth there must still force a real redirect to login", () => {
    expect(PUBLIC_AUTH_ROUTES).not.toContain(ROUTES.verifyEmail);
  });

  it("an unauthenticated user on register is considered acceptable — the 'Kayıt Ol' fix", () => {
    expect(isAtAnyTarget(PUBLIC_AUTH_ROUTES, ["(auth)", "register"])).toBe(true);
  });

  it("an unauthenticated user on forgot-password is considered acceptable", () => {
    expect(isAtAnyTarget(PUBLIC_AUTH_ROUTES, ["(auth)", "forgot-password"])).toBe(true);
  });

  it("an unauthenticated user on verify-email is NOT considered acceptable — must still be redirected to login", () => {
    expect(isAtAnyTarget(PUBLIC_AUTH_ROUTES, ["(auth)", "verify-email"])).toBe(false);
  });

  it("a user in a completely different group is not considered acceptable", () => {
    expect(isAtAnyTarget(PUBLIC_AUTH_ROUTES, ["(student)", "(tabs)"])).toBe(false);
  });
});
