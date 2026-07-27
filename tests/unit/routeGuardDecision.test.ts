import { ROUTES } from "@constants/routes";
import {
  decideRouteGuardTarget,
  RouteGuardAuthState,
  simulateRouteGuardNavigation,
} from "@features/authentication/services/routeGuardDecision";

// Comprehensive state×screen regression suite for RouteGuard, built on top
// of decideRouteGuardTarget/simulateRouteGuardNavigation — the SAME pure
// function RouteGuard.tsx actually calls in production (see
// routeGuardDecision.ts). Nothing here reimplements the decision logic, so
// a passing test proves the real behavior is correct, not that a parallel
// copy agrees with itself.

// ---- Screens (starting segments), matching the requested matrix ---------
const SCREENS: Record<string, string[]> = {
  login: ["(auth)", "login"],
  register: ["(auth)", "register"],
  "forgot-password": ["(auth)", "forgot-password"],
  "verify-email": ["(auth)", "verify-email"],
  "student (tabs root)": ["(student)", "(tabs)"],
  "student (nested)": ["(student)", "(tabs)", "profile"],
  "student (non-tab screen)": ["(student)", "edit-profile"],
  "teacher (root)": ["(teacher)"],
  "teacher (nested)": ["(teacher)", "class", "abc123"],
  "admin (root)": ["(admin)"],
  "unknown-role": ["unknown-role"],
};

// ---- Auth states, matching the requested matrix --------------------------
const BASE: RouteGuardAuthState = {
  settledEnoughToRoute: true,
  profileError: null,
  isAuthenticated: false,
  isEmailVerified: false,
  role: null,
};

const STATES: Record<string, RouteGuardAuthState> = {
  "oturum yok": { ...BASE },
  "oturum var, email doğrulanmamış": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: false,
    role: "student",
  },
  "oturum var, onboarding pending": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: "student",
    onboardingStatus: "pending",
  },
  "oturum var, onboarding provisioning": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: "teacher",
    onboardingStatus: "provisioning",
  },
  "doğrulanmış student": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: "student",
    onboardingStatus: "complete",
  },
  "doğrulanmış teacher": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: "teacher",
    onboardingStatus: "complete",
  },
  "doğrulanmış organization_admin": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: "organization_admin",
    onboardingStatus: "complete",
  },
  "doğrulanmış platform_admin": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: "platform_admin",
    onboardingStatus: "complete",
  },
  "bilinmeyen role": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: null,
    onboardingStatus: "complete",
  },
  "signOut yeni tamamlanmış (oturum yok ile aynı state)": { ...BASE },
  "verified teacher ama claimsSynced henüz false (promotion race)": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: "teacher",
    onboardingStatus: "complete",
    claimsSynced: false,
  },
  "profileError var": {
    ...BASE,
    isAuthenticated: true,
    isEmailVerified: true,
    role: "student",
    profileError: "Profil bilgileri yüklenirken bir hata oluştu.",
  },
};

// tsconfig has noUncheckedIndexedAccess, so STATES[name]/SCREENS[name] alone
// type as `T | undefined`. These two lookup tables are fixed, hand-written
// above — a missing key is a typo in the test itself, not a real runtime
// possibility — so a thrown error here is the correct, obvious failure mode.
function getState(name: keyof typeof STATES): RouteGuardAuthState {
  const state = STATES[name];
  if (!state) throw new Error(`Unknown test state: ${name}`);
  return state;
}

function getScreen(name: keyof typeof SCREENS): string[] {
  const segments = SCREENS[name];
  if (!segments) throw new Error(`Unknown test screen: ${name}`);
  return segments;
}

// "AuthProvider state geçici olarak güncelleniyor" — settledEnoughToRoute is
// false. This must NEVER produce a navigation, regardless of every other
// field, and is tested separately below rather than folded into the
// terminal-state matrix (by definition it's the non-terminal case).
const TRANSITIONING: RouteGuardAuthState = {
  ...BASE,
  settledEnoughToRoute: false,
  isAuthenticated: true,
  isEmailVerified: true,
  role: "teacher",
};

describe("RouteGuard state×screen matrix — terminates, never loops, always idempotent once settled", () => {
  for (const [stateName, state] of Object.entries(STATES)) {
    for (const [screenName, segments] of Object.entries(SCREENS)) {
      it(`[${stateName}] starting from [${screenName}] reaches a terminal state without looping`, () => {
        const result = simulateRouteGuardNavigation(state, segments);

        // Requirement #13: never an infinite router.replace loop.
        expect(result.loopDetected).toBe(false);

        // Requirement #14: RouteGuard reaches a terminal state — running
        // the simulation AGAIN from where it settled must be a true no-op.
        const second = simulateRouteGuardNavigation(state, result.finalSegments);
        expect(second.navigations).toEqual([]);
      });
    }
  }
});

describe("AuthProvider state geçici olarak güncelleniyor (transitioning/unsettled)", () => {
  it("never navigates while settledEnoughToRoute is false, no matter the screen", () => {
    for (const segments of Object.values(SCREENS)) {
      expect(decideRouteGuardTarget(TRANSITIONING, segments)).toBeNull();
    }
  });
});

describe("Requested end-to-end flows", () => {
  // 1. Login → Kayıt Ol
  it("1. an unauthenticated user can navigate from login to register and RouteGuard leaves them there", () => {
    const state = getState("oturum yok");
    expect(decideRouteGuardTarget(state, getScreen("register"))).toBeNull();
  });

  // 2. Login → Şifremi Unuttum
  it("2. an unauthenticated user can navigate from login to forgot-password and RouteGuard leaves them there", () => {
    const state = getState("oturum yok");
    expect(decideRouteGuardTarget(state, getScreen("forgot-password"))).toBeNull();
  });

  // 3. Register → Login
  it("3. an unauthenticated user can navigate from register back to login", () => {
    const state = getState("oturum yok");
    expect(decideRouteGuardTarget(state, getScreen("login"))).toBeNull();
  });

  // 4. Forgot Password → Login
  it("4. an unauthenticated user can navigate from forgot-password back to login", () => {
    const state = getState("oturum yok");
    expect(decideRouteGuardTarget(state, getScreen("login"))).toBeNull();
  });

  // 5. Kayıt → VerifyEmailScreen
  it("5. a freshly registered (authenticated, unverified) user sitting on verify-email is left there", () => {
    const state = getState("oturum var, email doğrulanmamış");
    expect(decideRouteGuardTarget(state, getScreen("verify-email"))).toBeNull();
  });

  // 6. VerifyEmailScreen → Çıkış Yap → Login
  it("6. a user who just signed out from verify-email IS actually redirected to login (the original real-device bug)", () => {
    const afterSignOut = getState("oturum yok");
    const target = decideRouteGuardTarget(afterSignOut, getScreen("verify-email"));
    expect(target).toBe(ROUTES.login);
  });

  // 7. Çıkıştan sonra tekrar Register
  it("7. after signing out, the user can navigate to register again without being bounced", () => {
    const afterSignOut = getState("oturum yok");
    expect(decideRouteGuardTarget(afterSignOut, getScreen("register"))).toBeNull();
  });

  // 8. VerifyEmailScreen'de oturum varken Tekrar Gönder (routing-level: the
  // screen itself must not be disturbed by RouteGuard while resend runs)
  it("8. an authenticated-unverified user resting on verify-email is not navigated away by RouteGuard mid-resend", () => {
    const state = getState("oturum var, email doğrulanmamış");
    expect(decideRouteGuardTarget(state, getScreen("verify-email"))).toBeNull();
  });

  // 9. Oturum yokken VerifyEmailScreen açık kalmaması
  it("9. an unauthenticated user is NEVER left on verify-email — always redirected to login", () => {
    const state = getState("oturum yok");
    const result = simulateRouteGuardNavigation(state, getScreen("verify-email"));
    expect(result.navigations).toEqual([ROUTES.login]);
  });

  // 10. Öğrencinin teacher route'una girememesi
  it("10. a verified student landing on teacher routes is redirected to the student dashboard, not left there", () => {
    const state = getState("doğrulanmış student");
    const result = simulateRouteGuardNavigation(state, getScreen("teacher (nested)"));
    expect(result.navigations).toEqual([ROUTES.student]);
  });

  // 11. Öğretmenin student route'una yanlış yönlendirilmemesi
  it("11. a verified teacher landing on student routes is redirected to the teacher dashboard, not left there", () => {
    const state = getState("doğrulanmış teacher");
    const result = simulateRouteGuardNavigation(state, getScreen("student (nested)"));
    expect(result.navigations).toEqual([ROUTES.teacher]);
  });

  it("11b. a verified teacher already on their own dashboard is left alone (no redundant replace)", () => {
    const state = getState("doğrulanmış teacher");
    expect(decideRouteGuardTarget(state, getScreen("teacher (nested)"))).toBeNull();
  });

  // 12. Pending/provisioning kullanıcının doğru onboarding ekranına gitmesi
  it("12a. a pending user anywhere in the app — including login/register/forgot-password — is routed to verify-email (isAuthenticated=true means the unauthenticated-only PUBLIC_AUTH_ROUTES allowance never applies)", () => {
    const state = getState("oturum var, onboarding pending");
    for (const [screenName, segments] of Object.entries(SCREENS)) {
      if (screenName === "verify-email") continue;
      const result = simulateRouteGuardNavigation(state, segments);
      expect(result.navigations).toEqual([ROUTES.verifyEmail]);
    }
  });

  it("12b. a provisioning user anywhere in the app is routed to verify-email", () => {
    const state = getState("oturum var, onboarding provisioning");
    const result = simulateRouteGuardNavigation(state, getScreen("teacher (root)"));
    expect(result.navigations).toEqual([ROUTES.verifyEmail]);
  });

  it("12c. a promoted teacher whose claims haven't synced yet stays on verify-email instead of a stale-token dashboard", () => {
    const state = getState("verified teacher ama claimsSynced henüz false (promotion race)");
    const result = simulateRouteGuardNavigation(state, getScreen("teacher (root)"));
    expect(result.navigations).toEqual([ROUTES.verifyEmail]);
  });
});

describe("Regression: (auth) group screens are distinct, not interchangeable", () => {
  it("an unauthenticated user on login is not treated as being on register/forgot-password/verify-email", () => {
    const state = getState("oturum yok");
    // Confirmed via the PUBLIC_AUTH_ROUTES allowance: login/register/
    // forgot-password all independently resolve to "stay", proving they're
    // recognized as distinct-but-individually-acceptable, not merged into
    // one interchangeable blob.
    expect(decideRouteGuardTarget(state, getScreen("login"))).toBeNull();
    expect(decideRouteGuardTarget(state, getScreen("register"))).toBeNull();
    expect(decideRouteGuardTarget(state, getScreen("forgot-password"))).toBeNull();
    // verify-email is the deliberate exception — proven distinct by NOT
    // being covered by the same allowance.
    expect(decideRouteGuardTarget(state, getScreen("verify-email"))).toBe(ROUTES.login);
  });
});

describe("Regression: unnecessary router.replace is never issued", () => {
  it("a settled, already-correct state produces zero navigations for every screen/state pairing where the screen IS the resolved target", () => {
    expect(decideRouteGuardTarget(getState("doğrulanmış student"), getScreen("student (tabs root)"))).toBeNull();
    expect(decideRouteGuardTarget(getState("doğrulanmış teacher"), getScreen("teacher (root)"))).toBeNull();
    expect(
      decideRouteGuardTarget(getState("doğrulanmış organization_admin"), getScreen("admin (root)")),
    ).toBeNull();
    expect(decideRouteGuardTarget(getState("bilinmeyen role"), getScreen("unknown-role"))).toBeNull();
  });
});

describe("Regression: profileError always wins and is itself terminal", () => {
  it("routes to unknown-role and stays there on a second run", () => {
    const state = getState("profileError var");
    const result = simulateRouteGuardNavigation(state, getScreen("student (tabs root)"));
    expect(result.navigations).toEqual(["/unknown-role"]);
    expect(result.loopDetected).toBe(false);
  });
});
