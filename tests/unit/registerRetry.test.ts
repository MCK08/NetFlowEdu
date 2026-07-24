// Proves the exact retry behavior of authService.registerStudent when a
// prior attempt got past setUsername but failed later (e.g. at
// initializeOnboarding) — the scenario audited here. Mocks every Firebase
// boundary registerStudent touches and imports the REAL function, so this
// exercises actual production control flow, not a reimplementation.

const mockCreateUserAccount = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSetDisplayName = jest.fn();
const mockSendVerificationEmail = jest.fn();
const mockGetUserProfileOnce = jest.fn();
const mockSetUsername = jest.fn();
const mockInitializeOnboarding = jest.fn();
const mockWaitForProfileDocument = jest.fn();

jest.mock("@services/firebase/auth", () => ({
  createUserAccount: () => mockCreateUserAccount(),
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
import { registerStudent } from "@features/authentication/services/authService";
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
    intendedRole: "student",
    ...overrides,
  };
}

function emailInUseError() {
  return new FirebaseError("auth/email-already-in-use", "in use");
}

function usernameAlreadySetError() {
  return new FirebaseError("functions/failed-precondition", "Kullanıcı adınız zaten belirlenmiş.");
}

function usernameTakenByOtherError() {
  return new FirebaseError("functions/already-exists", "Bu kullanıcı adı zaten alınmış.");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetDisplayName.mockResolvedValue(undefined);
  mockSendVerificationEmail.mockResolvedValue(undefined);
  mockWaitForProfileDocument.mockResolvedValue(null);
  mockInitializeOnboarding.mockResolvedValue({ onboardingStatus: "pending", requestedRole: "student" });
});

describe("registerStudent retry — setUsername succeeded, initializeOnboarding failed", () => {
  it("1. retry with the same username completes successfully after the account already owns it", async () => {
    // First attempt: account created, username reserved, then it dies.
    mockCreateUserAccount.mockResolvedValueOnce(USER);
    mockSetUsername.mockResolvedValueOnce({ success: true, username: "sinemmat" });
    mockInitializeOnboarding.mockRejectedValueOnce(new Error("network blip"));

    await expect(registerStudent(baseInput())).rejects.toThrow("network blip");

    // Second attempt: same email -> already-in-use -> signs back in; the
    // SAME username is already reserved for this uid -> setUsername
    // rejects failed-precondition -> account's own profile confirms it's
    // the same username -> treated as success -> onboarding proceeds.
    mockCreateUserAccount.mockRejectedValueOnce(emailInUseError());
    mockSignInWithPassword.mockResolvedValueOnce(USER);
    mockSetUsername.mockRejectedValueOnce(usernameAlreadySetError());
    mockGetUserProfileOnce.mockResolvedValueOnce({ username: "sinemmat" });
    mockInitializeOnboarding.mockResolvedValueOnce({
      onboardingStatus: "pending",
      requestedRole: "student",
    });

    const result = await registerStudent(baseInput());

    expect(result.user).toBe(USER);
    expect(mockInitializeOnboarding).toHaveBeenCalledTimes(2); // 1 failed + 1 succeeded
  });

  it("2. the retry never attempts to reserve a second/different username", async () => {
    mockCreateUserAccount.mockRejectedValueOnce(emailInUseError());
    mockSignInWithPassword.mockResolvedValueOnce(USER);
    mockSetUsername.mockRejectedValueOnce(usernameAlreadySetError());
    mockGetUserProfileOnce.mockResolvedValueOnce({ username: "sinemmat" });

    await registerStudent(baseInput({ username: "sinemmat" }));

    expect(mockSetUsername).toHaveBeenCalledTimes(1);
    expect(mockSetUsername).toHaveBeenCalledWith("sinemmat");
  });

  it("3. retry with a DIFFERENT username than the one already owned is rejected, not silently continued", async () => {
    mockCreateUserAccount.mockRejectedValueOnce(emailInUseError());
    mockSignInWithPassword.mockResolvedValueOnce(USER);
    const error = usernameAlreadySetError();
    mockSetUsername.mockRejectedValueOnce(error);
    // The account already owns "sinemmat", but this retry is submitting
    // "burakmat" — a mismatch.
    mockGetUserProfileOnce.mockResolvedValueOnce({ username: "sinemmat" });

    await expect(registerStudent(baseInput({ username: "burakmat" }))).rejects.toBe(error);

    // Never proceeds to onboarding on a mismatch.
    expect(mockInitializeOnboarding).not.toHaveBeenCalled();
  });

  it("4. a username owned by a DIFFERENT uid still returns the normal already-exists error, unaffected", async () => {
    mockCreateUserAccount.mockResolvedValueOnce(USER);
    const error = usernameTakenByOtherError();
    mockSetUsername.mockRejectedValueOnce(error);

    await expect(registerStudent(baseInput())).rejects.toBe(error);

    // already-exists is never treated as "mine" — no profile lookup, no
    // silent continuation, no onboarding call.
    expect(mockGetUserProfileOnce).not.toHaveBeenCalled();
    expect(mockInitializeOnboarding).not.toHaveBeenCalled();
  });

  it("5. direct username changes remain unsupported — a mismatch never results in a second setUsername call to overwrite it", async () => {
    mockCreateUserAccount.mockRejectedValueOnce(emailInUseError());
    mockSignInWithPassword.mockResolvedValueOnce(USER);
    mockSetUsername.mockRejectedValueOnce(usernameAlreadySetError());
    mockGetUserProfileOnce.mockResolvedValueOnce({ username: "sinemmat" });

    await expect(registerStudent(baseInput({ username: "burakmat" }))).rejects.toBeDefined();

    // Exactly one setUsername attempt — never retried with a "corrected"
    // value, never any second call that could look like a change/replace.
    expect(mockSetUsername).toHaveBeenCalledTimes(1);
  });

  it("6a. student onboarding retry completes with role 'student'", async () => {
    mockCreateUserAccount.mockRejectedValueOnce(emailInUseError());
    mockSignInWithPassword.mockResolvedValueOnce(USER);
    mockSetUsername.mockRejectedValueOnce(usernameAlreadySetError());
    mockGetUserProfileOnce.mockResolvedValueOnce({ username: "sinemmat" });

    await registerStudent(baseInput({ intendedRole: "student", displayName: "Ayşe" }));

    expect(mockInitializeOnboarding).toHaveBeenCalledWith("student", "Ayşe");
  });

  it("6b. teacher onboarding retry completes with role 'teacher'", async () => {
    mockCreateUserAccount.mockRejectedValueOnce(emailInUseError());
    mockSignInWithPassword.mockResolvedValueOnce(USER);
    mockSetUsername.mockRejectedValueOnce(usernameAlreadySetError());
    mockGetUserProfileOnce.mockResolvedValueOnce({ username: "sinemmat" });

    await registerStudent(baseInput({ intendedRole: "teacher", displayName: "Sinem Hoca" }));

    expect(mockInitializeOnboarding).toHaveBeenCalledWith("teacher", "Sinem Hoca");
  });
});
