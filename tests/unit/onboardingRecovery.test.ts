// Regression suite for the 2026-07-27 production incident:
// "E-postanız doğrulandı ancak hesap tipiniz ayarlanamadı."
//
// Proven chain (from Cloud Logging + a read-only Firestore/Auth snapshot):
//   setUsername -> HTTP 409 (functions/already-exists, username taken)
//   -> registerStudent re-threw
//   -> initializeOnboarding NEVER ran (zero invocations that day)
//   -> users/{uid}.requestedRole stayed null, onboardingStatus "pending"
//   -> but the Auth account already existed, so RouteGuard had already
//      moved the user to verify-email and the register screen's error was
//      never seen
//   -> completeOnboarding -> HTTP 400 (functions/failed-precondition,
//      "Hesap türü seçilmemiş") x5
//   -> verifyAndCompleteOnboarding's bare `catch { return false }` discarded
//      every one of those codes, leaving only a generic message.
//
// These tests exercise the REAL production functions (only the Firebase
// boundary is mocked), so they fail if the ordering or the error-code
// propagation regresses.

const mockCreateUserAccount = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSetDisplayName = jest.fn();
const mockSendVerificationEmail = jest.fn();
const mockGetUserProfileOnce = jest.fn();
const mockSetUsername = jest.fn();
const mockInitializeOnboarding = jest.fn();
const mockWaitForProfileDocument = jest.fn();
const mockCompleteOnboarding = jest.fn();
const mockReloadCurrentUser = jest.fn();
const mockRefreshIdToken = jest.fn();

// Shared ordered log of every Firebase boundary call, so ordering between
// two different modules can be asserted directly.
const callOrder: string[] = [];

jest.mock("@services/firebase/auth", () => ({
  createUserAccount: (...a: unknown[]) => mockCreateUserAccount(...a),
  signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
  setDisplayName: (...a: unknown[]) => mockSetDisplayName(...a),
  sendVerificationEmail: (...a: unknown[]) => mockSendVerificationEmail(...a),
  reloadCurrentUser: (...a: unknown[]) => mockReloadCurrentUser(...a),
  refreshIdToken: (...a: unknown[]) => mockRefreshIdToken(...a),
  sendPasswordReset: jest.fn(),
  signOutCurrentUser: jest.fn(),
}));

jest.mock("@services/firebase/firestore", () => ({
  getUserProfileOnce: (...a: unknown[]) => mockGetUserProfileOnce(...a),
}));

jest.mock("@services/firebase/functions", () => ({
  setUsername: (...a: unknown[]) => mockSetUsername(...a),
  initializeOnboarding: (...a: unknown[]) => mockInitializeOnboarding(...a),
  completeOnboarding: (...a: unknown[]) => mockCompleteOnboarding(...a),
}));

jest.mock("@features/authentication/services/profileWait", () => ({
  waitForProfileDocument: (...a: unknown[]) => mockWaitForProfileDocument(...a),
}));

// eslint-disable-next-line import/first
import { FirebaseError } from "firebase/app";
// eslint-disable-next-line import/first
import { User } from "firebase/auth";
// eslint-disable-next-line import/first
import { registerStudent } from "@features/authentication/services/authService";
// eslint-disable-next-line import/first
import { verifyAndCompleteOnboarding } from "@features/authentication/services/onboardingSession";
// eslint-disable-next-line import/first
import {
  isRetryableOnboardingFailure,
  mapAuthErrorToMessage,
  mapOnboardingFailureToMessage,
} from "@features/authentication/services/errorMapper";
// eslint-disable-next-line import/first
import { decideRouteGuardTarget } from "@features/authentication/services/routeGuardDecision";
// eslint-disable-next-line import/first
import { ROUTES } from "@constants/routes";
// eslint-disable-next-line import/first
import { RegisterInput } from "@features/authentication/types";

const UID = "qbSm3NDkFvdIEOSqlQlh2VoSBc43";
const USER = { uid: UID, emailVerified: false } as never;

function teacherInput(overrides: Partial<RegisterInput> = {}): RegisterInput {
  return {
    displayName: "Sinem Hoca",
    username: "sinemmat",
    email: "sinem@example.com",
    password: "Valid123",
    confirmPassword: "Valid123",
    acceptedTerms: true,
    intendedRole: "teacher",
    ...overrides,
  };
}

function usernameTakenError() {
  return new FirebaseError("functions/already-exists", "Bu kullanıcı adı zaten alınmış.");
}
function roleMissingError() {
  return new FirebaseError("functions/failed-precondition", "Hesap türü seçilmemiş.");
}
function makeVerifiedUser(): User {
  return { uid: UID, emailVerified: true } as User;
}

beforeEach(() => {
  callOrder.length = 0;
  [
    mockCreateUserAccount,
    mockSignInWithPassword,
    mockSetDisplayName,
    mockSendVerificationEmail,
    mockGetUserProfileOnce,
    mockSetUsername,
    mockInitializeOnboarding,
    mockWaitForProfileDocument,
    mockCompleteOnboarding,
    mockReloadCurrentUser,
    mockRefreshIdToken,
  ].forEach((m) => m.mockReset());

  mockCreateUserAccount.mockResolvedValue(USER);
  mockSetDisplayName.mockResolvedValue(undefined);
  mockSendVerificationEmail.mockResolvedValue(undefined);
  mockWaitForProfileDocument.mockResolvedValue(null);
  mockReloadCurrentUser.mockResolvedValue(undefined);
  mockRefreshIdToken.mockResolvedValue(undefined);

  mockInitializeOnboarding.mockImplementation(async () => {
    callOrder.push("initializeOnboarding");
    return { onboardingStatus: "pending", requestedRole: "teacher" };
  });
  mockSetUsername.mockImplementation(async () => {
    callOrder.push("setUsername");
    return { success: true, username: "sinemmat" };
  });
});

describe("registerStudent — requestedRole is persisted before any user-correctable failure", () => {
  it("1. calls initializeOnboarding BEFORE setUsername (the exact ordering the incident turned on)", async () => {
    await registerStudent(teacherInput());
    expect(callOrder).toEqual(["initializeOnboarding", "setUsername"]);
  });

  it("2. a taken username (functions/already-exists) still leaves requestedRole persisted, and the error still reaches the caller", async () => {
    const err = usernameTakenError();
    mockSetUsername.mockImplementation(async () => {
      callOrder.push("setUsername");
      throw err;
    });

    await expect(registerStudent(teacherInput())).rejects.toBe(err);

    // The whole point of the fix: Stage 1 already ran, so the account is
    // NOT stranded with requestedRole=null the way qbSm3N… was.
    expect(mockInitializeOnboarding).toHaveBeenCalledTimes(1);
    expect(mockInitializeOnboarding).toHaveBeenCalledWith("teacher", "Sinem Hoca");
    expect(callOrder).toEqual(["initializeOnboarding", "setUsername"]);
  });

  it("3. the intended role reaches Stage 1 verbatim — a teacher never silently registers as a student", async () => {
    mockSetUsername.mockImplementation(async () => {
      throw usernameTakenError();
    });
    await expect(registerStudent(teacherInput({ intendedRole: "teacher" }))).rejects.toBeDefined();
    expect(mockInitializeOnboarding).toHaveBeenCalledWith("teacher", expect.any(String));
  });

  it("4. a student registration still records student — the fix never promotes anyone", async () => {
    await registerStudent(teacherInput({ intendedRole: "student" }));
    expect(mockInitializeOnboarding).toHaveBeenCalledWith("student", "Sinem Hoca");
  });

  it("5. resubmitting after a username collision (account-reuse path) completes end to end", async () => {
    // First attempt: username taken.
    mockSetUsername.mockImplementationOnce(async () => {
      throw usernameTakenError();
    });
    await expect(registerStudent(teacherInput())).rejects.toBeDefined();

    // Second attempt, different username: the email now already exists, so
    // registration signs back into the SAME account and finishes.
    mockCreateUserAccount.mockRejectedValueOnce(
      new FirebaseError("auth/email-already-in-use", "in use"),
    );
    mockSignInWithPassword.mockResolvedValueOnce(USER);

    const result = await registerStudent(teacherInput({ username: "sinemmat2" }));
    expect(result.user).toBe(USER);
    expect(mockInitializeOnboarding).toHaveBeenCalledTimes(2); // idempotent server-side
  });
});

describe("verifyAndCompleteOnboarding — the real failure code survives", () => {
  it("6. reports the actual callable code instead of a bare false (the discarded-code bug)", async () => {
    mockCompleteOnboarding.mockRejectedValueOnce(roleMissingError());

    await expect(verifyAndCompleteOnboarding(makeVerifiedUser())).resolves.toEqual({
      completed: false,
      failureCode: "functions/failed-precondition",
    });
  });

  it("7. a transient failure is reported, and an immediate retry converges to success (idempotent)", async () => {
    mockCompleteOnboarding.mockRejectedValueOnce(
      new FirebaseError("functions/unavailable", "backend unavailable"),
    );
    mockCompleteOnboarding.mockResolvedValueOnce({
      role: "teacher",
      organizationId: UID,
      onboardingStatus: "complete",
    });

    const first = await verifyAndCompleteOnboarding(makeVerifiedUser());
    const second = await verifyAndCompleteOnboarding(makeVerifiedUser());

    expect(first).toEqual({ completed: false, failureCode: "functions/unavailable" });
    expect(second).toEqual({ completed: true });
    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(2);
  });

  it("8. success is decided ONLY by the callable, never by a possibly-stale profile snapshot", async () => {
    mockCompleteOnboarding.mockResolvedValueOnce({
      role: "teacher",
      organizationId: UID,
      onboardingStatus: "complete",
    });

    await expect(verifyAndCompleteOnboarding(makeVerifiedUser())).resolves.toEqual({
      completed: true,
    });
    // No profile read is involved in deciding success.
    expect(mockGetUserProfileOnce).not.toHaveBeenCalled();
  });

  it("9. an unverified user never reaches the callable and says so explicitly", async () => {
    await expect(
      verifyAndCompleteOnboarding({ uid: UID, emailVerified: false } as User),
    ).resolves.toEqual({ completed: false, failureCode: "client/email-not-verified" });
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
  });
});

describe("Error messages — the onboarding failure is no longer described as a username problem", () => {
  it("10. functions/failed-precondition means something COMPLETELY different for onboarding than for setUsername", () => {
    const usernameContext = mapAuthErrorToMessage(roleMissingError());
    const onboardingContext = mapOnboardingFailureToMessage("functions/failed-precondition");

    expect(usernameContext).toBe("Hesabınızda zaten farklı bir kullanıcı adı tanımlı.");
    expect(onboardingContext).not.toBe(usernameContext);
    expect(onboardingContext).toContain("Hesap türünüz");
  });

  it("11. every mapped onboarding message is Turkish, non-technical, and never leaks the raw code", () => {
    for (const code of [
      "functions/failed-precondition",
      "functions/not-found",
      "functions/unauthenticated",
      "functions/unavailable",
      "client/email-not-verified",
      "client/no-current-user",
    ]) {
      const msg = mapOnboardingFailureToMessage(code);
      expect(msg).not.toContain("functions/");
      expect(msg).not.toContain("client/");
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("12. retryable and permanent failures are distinguished", () => {
    expect(isRetryableOnboardingFailure("functions/unavailable")).toBe(true);
    expect(isRetryableOnboardingFailure("functions/internal")).toBe(true);
    // "Hesap türü seçilmemiş" is NOT fixed by pressing the button again.
    expect(isRetryableOnboardingFailure("functions/failed-precondition")).toBe(false);
    expect(isRetryableOnboardingFailure(undefined)).toBe(false);
  });

  it("13. an unknown code still produces a safe generic message, never a crash", () => {
    expect(mapOnboardingFailureToMessage("functions/some-new-code")).toBe(
      "Hesap tipiniz ayarlanamadı. Lütfen tekrar deneyin.",
    );
  });
});

describe("RouteGuard — why the register screen's error was never seen, and where the user must end up", () => {
  const settled = { settledEnoughToRoute: true, profileError: null };

  it("14. the instant the Auth account exists (unverified), RouteGuard moves the user off register to verify-email", () => {
    // This is what made the incident invisible: registerStudent was still
    // running (and about to fail on setUsername) while the user had already
    // been navigated away from the screen showing that error.
    const target = decideRouteGuardTarget(
      { ...settled, isAuthenticated: true, isEmailVerified: false, role: "student" },
      ["(auth)", "register"],
    );
    expect(target).toBe(ROUTES.verifyEmail);
  });

  it("15. a pending teacher stays on the verify-email retry surface, never the teacher dashboard", () => {
    const target = decideRouteGuardTarget(
      {
        ...settled,
        isAuthenticated: true,
        isEmailVerified: true,
        role: "teacher",
        onboardingStatus: "pending",
      },
      ["(teacher)"],
    );
    expect(target).toBe(ROUTES.verifyEmail);
  });

  it("16. only a complete, claims-synced teacher reaches the teacher dashboard", () => {
    const target = decideRouteGuardTarget(
      {
        ...settled,
        isAuthenticated: true,
        isEmailVerified: true,
        role: "teacher",
        onboardingStatus: "complete",
        claimsSynced: true,
      },
      ["(auth)", "verify-email"],
    );
    expect(target).toBe(ROUTES.teacher);
  });

  it("17. an unauthenticated user goes to login", () => {
    const target = decideRouteGuardTarget(
      { ...settled, isAuthenticated: false, isEmailVerified: false, role: null },
      ["(auth)", "verify-email"],
    );
    expect(target).toBe(ROUTES.login);
  });
});
