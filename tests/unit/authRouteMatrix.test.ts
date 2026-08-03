import { ROUTES } from "@constants/routes";
import {
  decideRouteGuardTarget,
  RouteGuardAuthState,
  simulateRouteGuardNavigation,
} from "@features/authentication/services/routeGuardDecision";

// Every scenario below is a REAL state this app can be in. The state
// objects are built from named helpers rather than inline literals so a
// scenario reads as the situation it describes, and so a future field
// addition has one place to default.

const SIGNED_OUT: RouteGuardAuthState = {
  settledEnoughToRoute: true,
  profileError: null,
  isAuthenticated: false,
  isEmailVerified: false,
  role: null,
  onboardingStatus: null,
};

function completed(role: RouteGuardAuthState["role"]): RouteGuardAuthState {
  return {
    settledEnoughToRoute: true,
    profileError: null,
    isAuthenticated: true,
    isEmailVerified: true,
    role,
    onboardingStatus: "complete",
    claimsSynced: true,
    hasRequestedRole: true,
  };
}

// An account created before onboardingStatus existed: resolveOnboardingStatus
// maps its absent raw value to "complete", and the optional fields were
// simply never passed by the call sites that predate them.
function legacyCompleted(role: RouteGuardAuthState["role"]): RouteGuardAuthState {
  return {
    settledEnoughToRoute: true,
    profileError: null,
    isAuthenticated: true,
    isEmailVerified: true,
    role,
  };
}

const UNVERIFIED: RouteGuardAuthState = {
  settledEnoughToRoute: true,
  profileError: null,
  isAuthenticated: true,
  isEmailVerified: false,
  role: "student",
  onboardingStatus: "pending",
  hasRequestedRole: true,
};

// A brand-new Google sign-up: verified by Google, but initializeOnboarding
// has never run so requestedRole is still null.
const NEW_GOOGLE_USER: RouteGuardAuthState = {
  settledEnoughToRoute: true,
  profileError: null,
  isAuthenticated: true,
  isEmailVerified: true,
  role: "student",
  onboardingStatus: "pending",
  claimsSynced: true,
  hasRequestedRole: false,
};

const STUDENT_SEGMENTS = ["(student)", "(tabs)"];
const TEACHER_SEGMENTS = ["(teacher)", "(tabs)"];
const LOGIN_SEGMENTS = ["(auth)", "login"];
const GOOGLE_ONBOARDING_SEGMENTS = ["(auth)", "google-onboarding"];
const VERIFY_SEGMENTS = ["(auth)", "verify-email"];

// Reaching a destination is what matters, not how many hops it took — so
// every scenario asserts on the settled result of the real redirect loop.
function settle(state: RouteGuardAuthState, from: string[]) {
  const result = simulateRouteGuardNavigation(state, from);
  expect(result.loopDetected).toBe(false);
  return result;
}

describe("bootstrap and cold start", () => {
  it("never navigates from any screen while the auth state is still unknown", () => {
    const bootstrapping: RouteGuardAuthState = { ...SIGNED_OUT, settledEnoughToRoute: false };
    for (const segments of [
      [],
      LOGIN_SEGMENTS,
      STUDENT_SEGMENTS,
      TEACHER_SEGMENTS,
      VERIFY_SEGMENTS,
      GOOGLE_ONBOARDING_SEGMENTS,
    ]) {
      expect(decideRouteGuardTarget(bootstrapping, segments)).toBeNull();
    }
  });

  // Restoring a stored session lands on the role's own dashboard directly —
  // never via the login screen, which is what a "login flash" would be.
  it("a restored student session goes straight to the student dashboard from root", () => {
    const result = settle(completed("student"), []);
    expect(result.navigations).toEqual([ROUTES.student]);
    expect(result.navigations).not.toContain(ROUTES.login);
  });

  it("a restored teacher session goes straight to the teacher dashboard from root", () => {
    const result = settle(completed("teacher"), []);
    expect(result.navigations).toEqual([ROUTES.teacher]);
    expect(result.navigations).not.toContain(ROUTES.login);
  });

  it("a signed-out cold start lands on login and stays there", () => {
    const result = settle(SIGNED_OUT, []);
    expect(result.navigations).toEqual([ROUTES.login]);
    expect(decideRouteGuardTarget(SIGNED_OUT, LOGIN_SEGMENTS)).toBeNull();
  });
});

describe("account switching", () => {
  // The transition itself: AuthProvider reports profileLoading for the new
  // account, so settledEnoughToRoute is false and the guard must hold
  // completely still — this is what stops the OLD account's destination from
  // being applied to the NEW session.
  it("holds still during the switch transition, from either dashboard", () => {
    const transitioning: RouteGuardAuthState = {
      ...completed("teacher"),
      settledEnoughToRoute: false,
    };
    expect(decideRouteGuardTarget(transitioning, STUDENT_SEGMENTS)).toBeNull();
    expect(decideRouteGuardTarget(transitioning, TEACHER_SEGMENTS)).toBeNull();
  });

  it("switching student -> teacher moves off the student dashboard to the teacher one", () => {
    const result = settle(completed("teacher"), STUDENT_SEGMENTS);
    expect(result.navigations).toEqual([ROUTES.teacher]);
    expect(result.finalSegments).toEqual(TEACHER_SEGMENTS);
  });

  it("switching teacher -> student moves off the teacher dashboard to the student one", () => {
    const result = settle(completed("student"), TEACHER_SEGMENTS);
    expect(result.navigations).toEqual([ROUTES.student]);
    expect(result.finalSegments).toEqual(STUDENT_SEGMENTS);
  });

  // The destination is recomputed from the NEW account's role, never
  // remembered from the previous one.
  it("recalculates the destination purely from the active role, not the screen it started on", () => {
    for (const from of [STUDENT_SEGMENTS, TEACHER_SEGMENTS, LOGIN_SEGMENTS, []]) {
      expect(settle(completed("teacher"), from).finalSegments).toEqual(TEACHER_SEGMENTS);
      expect(settle(completed("student"), from).finalSegments).toEqual(STUDENT_SEGMENTS);
    }
  });

  // A switch that lands on a brand-new Google account must reach onboarding,
  // not a dashboard — the account has no requestedRole yet.
  it("switching to an account that never finished Google onboarding lands on onboarding", () => {
    expect(settle(NEW_GOOGLE_USER, STUDENT_SEGMENTS).finalSegments).toEqual(
      GOOGLE_ONBOARDING_SEGMENTS,
    );
    expect(settle(NEW_GOOGLE_USER, TEACHER_SEGMENTS).finalSegments).toEqual(
      GOOGLE_ONBOARDING_SEGMENTS,
    );
  });
});

describe("Google onboarding", () => {
  it("sends a brand-new Google account to onboarding from anywhere, including login", () => {
    for (const from of [[], LOGIN_SEGMENTS, STUDENT_SEGMENTS, VERIFY_SEGMENTS]) {
      expect(settle(NEW_GOOGLE_USER, from).finalSegments).toEqual(GOOGLE_ONBOARDING_SEGMENTS);
    }
  });

  it("leaves a brand-new Google account alone once it is on the onboarding screen", () => {
    expect(decideRouteGuardTarget(NEW_GOOGLE_USER, GOOGLE_ONBOARDING_SEGMENTS)).toBeNull();
  });

  // Once initializeOnboarding has run, requestedRole is no longer null and
  // the account must never be pulled back to this screen.
  it("pulls a COMPLETED account off the onboarding screen to its dashboard", () => {
    expect(settle(completed("student"), GOOGLE_ONBOARDING_SEGMENTS).finalSegments).toEqual(
      STUDENT_SEGMENTS,
    );
    expect(settle(completed("teacher"), GOOGLE_ONBOARDING_SEGMENTS).finalSegments).toEqual(
      TEACHER_SEGMENTS,
    );
  });

  it("never bounces between login and Google onboarding", () => {
    const result = simulateRouteGuardNavigation(NEW_GOOGLE_USER, LOGIN_SEGMENTS);
    expect(result.loopDetected).toBe(false);
    expect(result.navigations.length).toBeLessThanOrEqual(2);
  });

  // Only "pending" diverts. A signed-out session outranks everything.
  it("sends a signed-out user to login even if their last known state was Google onboarding", () => {
    expect(settle(SIGNED_OUT, GOOGLE_ONBOARDING_SEGMENTS).navigations).toEqual([ROUTES.login]);
  });
});

describe("legacy completed accounts are never dragged back into onboarding", () => {
  it("routes straight to the dashboard with none of the optional onboarding fields set", () => {
    expect(settle(legacyCompleted("student"), []).finalSegments).toEqual(STUDENT_SEGMENTS);
    expect(settle(legacyCompleted("teacher"), []).finalSegments).toEqual(TEACHER_SEGMENTS);
  });

  it("never sends a legacy account to verify-email or Google onboarding", () => {
    for (const role of ["student", "teacher"] as const) {
      const result = settle(legacyCompleted(role), []);
      expect(result.navigations).not.toContain(ROUTES.verifyEmail);
      expect(result.navigations).not.toContain(ROUTES.googleOnboarding);
    }
  });

  it("leaves a legacy account already on its dashboard completely alone", () => {
    expect(decideRouteGuardTarget(legacyCompleted("student"), STUDENT_SEGMENTS)).toBeNull();
    expect(decideRouteGuardTarget(legacyCompleted("teacher"), TEACHER_SEGMENTS)).toBeNull();
  });
});

describe("session loss and invalidation", () => {
  it("logging out from a protected route lands on login, from either dashboard", () => {
    expect(settle(SIGNED_OUT, STUDENT_SEGMENTS).navigations).toEqual([ROUTES.login]);
    expect(settle(SIGNED_OUT, TEACHER_SEGMENTS).navigations).toEqual([ROUTES.login]);
  });

  // An invalidated token surfaces as isAuthenticated false; the completed
  // profile state left over from before must not keep the user in the app.
  it("an invalidated session leaves no protected route reachable", () => {
    const invalidated: RouteGuardAuthState = { ...completed("teacher"), isAuthenticated: false };
    expect(settle(invalidated, TEACHER_SEGMENTS).finalSegments).toEqual(LOGIN_SEGMENTS);
  });

  it("a signed-out user is never left on verify-email or Google onboarding", () => {
    for (const from of [VERIFY_SEGMENTS, GOOGLE_ONBOARDING_SEGMENTS]) {
      expect(settle(SIGNED_OUT, from).finalSegments).toEqual(LOGIN_SEGMENTS);
    }
  });
});

describe("missing profile: transient versus terminal", () => {
  // Transient — the listener simply hasn't delivered yet. AuthProvider keeps
  // settledEnoughToRoute false, so nothing is decided from a null role.
  it("does NOT route to unknown-role while the profile is merely still loading", () => {
    const stillLoading: RouteGuardAuthState = {
      settledEnoughToRoute: false,
      profileError: null,
      isAuthenticated: true,
      isEmailVerified: true,
      role: null,
      onboardingStatus: null,
    };
    for (const segments of [[], STUDENT_SEGMENTS, TEACHER_SEGMENTS, LOGIN_SEGMENTS]) {
      expect(decideRouteGuardTarget(stillLoading, segments)).toBeNull();
    }
  });

  // Terminal — the bounded wait expired or the read failed. Fails closed:
  // no dashboard is guessed.
  it("routes to unknown-role once the profile read has terminally failed, and stays there", () => {
    const terminal: RouteGuardAuthState = {
      settledEnoughToRoute: true,
      profileError: "Profil bilgileri yüklenemedi. Lütfen tekrar deneyin.",
      isAuthenticated: true,
      isEmailVerified: true,
      role: null,
      onboardingStatus: null,
    };
    const result = settle(terminal, STUDENT_SEGMENTS);
    expect(result.finalSegments).toEqual(["unknown-role"]);
    expect(decideRouteGuardTarget(terminal, ["unknown-role"])).toBeNull();
  });

  // A settled, verified session whose role is genuinely unrecognized also
  // fails closed rather than defaulting to the student dashboard.
  it("fails closed for a settled session with an unrecognized role", () => {
    const noRole: RouteGuardAuthState = { ...completed("student"), role: null };
    expect(settle(noRole, []).finalSegments).toEqual(["unknown-role"]);
  });
});

describe("no protected content is ever reachable before it should be", () => {
  const BLOCKED: { name: string; state: RouteGuardAuthState }[] = [
    { name: "signed out", state: SIGNED_OUT },
    { name: "unverified", state: UNVERIFIED },
    { name: "brand-new Google account", state: NEW_GOOGLE_USER },
  ];

  it("moves every not-yet-entitled state off both dashboards", () => {
    for (const { name, state } of BLOCKED) {
      for (const from of [STUDENT_SEGMENTS, TEACHER_SEGMENTS]) {
        const result = settle(state, from);
        expect([result.finalSegments.join("/"), name][0]).not.toBe(from.join("/"));
        expect(result.finalSegments[0]).toBe("(auth)");
      }
    }
  });
});
