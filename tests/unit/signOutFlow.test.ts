// Regression tests for the "Çıkış Yap does nothing" bug. authService.logout
// takes no user argument and unconditionally calls Firebase's signOut(auth)
// — there is no user-specific state to guard, so it is inherently
// idempotent/safe to call regardless of whether a user is currently signed
// in (Firebase's own signOut() is a documented no-op-safe call with no
// current user). This test proves logout() is a thin, unconditional,
// error-propagating wrapper — it neither swallows a failure nor requires a
// user object, matching requirement "Firebase user null olduğunda logout
// kontrollü ve idempotent davranır."

const mockSignOutCurrentUser = jest.fn();

jest.mock("@services/firebase/auth", () => ({
  createUserAccount: jest.fn(),
  reloadCurrentUser: jest.fn(),
  sendPasswordReset: jest.fn(),
  sendVerificationEmail: jest.fn(),
  setDisplayName: jest.fn(),
  signInWithPassword: jest.fn(),
  signOutCurrentUser: (...args: unknown[]) => mockSignOutCurrentUser(...args),
}));

jest.mock("@services/firebase/firestore", () => ({
  getUserProfileOnce: jest.fn(),
}));

jest.mock("@services/firebase/functions", () => ({
  setUsername: jest.fn(),
  initializeOnboarding: jest.fn(),
}));

jest.mock("@features/authentication/services/profileWait", () => ({
  waitForProfileDocument: jest.fn(),
}));

// eslint-disable-next-line import/first
import { logout } from "@features/authentication/services/authService";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("authService.logout", () => {
  it("calls Firebase signOut exactly once and takes no user argument (works regardless of any 'current user' concept at this layer)", async () => {
    mockSignOutCurrentUser.mockResolvedValueOnce(undefined);

    await logout();

    expect(mockSignOutCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockSignOutCurrentUser).toHaveBeenCalledWith();
  });

  // The previous bug was NOT here — logout() always propagated correctly.
  // It was that nothing in the UI layer (VerifyEmailScreen's button) ever
  // caught what this propagates. This test locks in that logout() itself
  // must keep propagating, so a future regression can't silently swallow it
  // at this layer either.
  it("propagates a signOut failure instead of swallowing it", async () => {
    mockSignOutCurrentUser.mockRejectedValueOnce(new Error("network error"));

    await expect(logout()).rejects.toThrow("network error");
  });
});
