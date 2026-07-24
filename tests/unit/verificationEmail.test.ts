// Regression tests for the "teacher account created in Auth but verification
// email never arrives" bug. Root cause: registerStudent() used to swallow
// sendVerificationEmail failures in an empty catch, so the caller (and
// therefore the UI) had no way to distinguish "sent" from "silently failed" —
// it always reported success. Fixed by tracking and returning
// verificationEmailSent, and by no longer no-op'ing resendVerification when
// there's no current user.

const mockCreateUserAccount = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSetDisplayName = jest.fn();
const mockSendVerificationEmail = jest.fn();
const mockGetUserProfileOnce = jest.fn();
const mockSetUsername = jest.fn();
const mockInitializeOnboarding = jest.fn();
const mockWaitForProfileDocument = jest.fn();

jest.mock("@services/firebase/auth", () => ({
  createUserAccount: (...args: unknown[]) => mockCreateUserAccount(...args),
  reloadCurrentUser: jest.fn(),
  sendPasswordReset: jest.fn(),
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
  setDisplayName: (...args: unknown[]) => mockSetDisplayName(...args),
  signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
  signOutCurrentUser: jest.fn(),
}));

jest.mock("@services/firebase/firestore", () => ({
  getUserProfileOnce: (...args: unknown[]) => mockGetUserProfileOnce(...args),
}));

jest.mock("@services/firebase/functions", () => ({
  setUsername: (...args: unknown[]) => mockSetUsername(...args),
  initializeOnboarding: (...args: unknown[]) => mockInitializeOnboarding(...args),
}));

jest.mock("@features/authentication/services/profileWait", () => ({
  waitForProfileDocument: (...args: unknown[]) => mockWaitForProfileDocument(...args),
}));

// eslint-disable-next-line import/first
import { FirebaseError } from "firebase/app";
// eslint-disable-next-line import/first
import {
  registerStudent,
  resendVerificationEmail,
} from "@features/authentication/services/authService";
// eslint-disable-next-line import/first
import { RegisterInput } from "@features/authentication/types";

const UID = "uid-1";
const USER = { uid: UID, emailVerified: false } as never;

function baseInput(overrides: Partial<RegisterInput> = {}): RegisterInput {
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

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateUserAccount.mockResolvedValue(USER);
  mockSetDisplayName.mockResolvedValue(undefined);
  mockSendVerificationEmail.mockResolvedValue(undefined);
  mockWaitForProfileDocument.mockResolvedValue(null);
  mockSetUsername.mockResolvedValue({ success: true, username: "sinemmat" });
  mockInitializeOnboarding.mockResolvedValue({
    onboardingStatus: "pending",
    requestedRole: "teacher",
  });
});

describe("registerStudent — verification email send is no longer silently swallowed", () => {
  it("1. calls sendVerificationEmail exactly once during registration, with the SAME user object createUserAccount returned (credential.user), not auth.currentUser", async () => {
    await registerStudent(baseInput());

    expect(mockSendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(USER);
  });

  it("2. reports verificationEmailSent: true when the send succeeds", async () => {
    const result = await registerStudent(baseInput());
    expect(result.verificationEmailSent).toBe(true);
  });

  it("3. reports verificationEmailSent: false — never true — when sendVerificationEmail actually fails, and registration still completes (account not rolled back)", async () => {
    mockSendVerificationEmail.mockRejectedValueOnce(
      new FirebaseError("auth/too-many-requests", "rate limited"),
    );

    const result = await registerStudent(baseInput());

    expect(result.verificationEmailSent).toBe(false);
    expect(result.user).toBe(USER);
    // Registration proceeds — onboarding still runs, account isn't stranded.
    expect(mockInitializeOnboarding).toHaveBeenCalledTimes(1);
  });

  it("4. a failed send during registration never throws out of registerStudent (non-fatal), so the caller can't accidentally treat it as a hard registration failure", async () => {
    mockSendVerificationEmail.mockRejectedValueOnce(
      new FirebaseError("auth/network-request-failed", "network"),
    );

    await expect(registerStudent(baseInput())).resolves.toMatchObject({
      verificationEmailSent: false,
    });
  });

  it("5. a retry after a failed send can later report success (account already exists, no email-already-in-use dead end)", async () => {
    mockSendVerificationEmail.mockRejectedValueOnce(
      new FirebaseError("auth/network-request-failed", "network"),
    );
    const first = await registerStudent(baseInput());
    expect(first.verificationEmailSent).toBe(false);

    mockCreateUserAccount.mockRejectedValueOnce(
      new FirebaseError("auth/email-already-in-use", "in use"),
    );
    mockSignInWithPassword.mockResolvedValueOnce(USER);
    mockSetUsername.mockRejectedValueOnce(
      new FirebaseError("functions/failed-precondition", "already set"),
    );
    mockGetUserProfileOnce.mockResolvedValueOnce({ username: "sinemmat" });

    const second = await registerStudent(baseInput());
    expect(second.verificationEmailSent).toBe(true);
  });
});

describe("resendVerificationEmail — failures propagate (never reported as success)", () => {
  it("6. propagates the real error code to the caller instead of swallowing it", async () => {
    mockSendVerificationEmail.mockRejectedValueOnce(
      new FirebaseError("auth/too-many-requests", "rate limited"),
    );

    await expect(resendVerificationEmail(USER)).rejects.toMatchObject({
      code: "auth/too-many-requests",
    });
  });

  it("7. resolves cleanly on success, calling sendVerificationEmail exactly once", async () => {
    await resendVerificationEmail(USER);
    expect(mockSendVerificationEmail).toHaveBeenCalledTimes(1);
  });
});
