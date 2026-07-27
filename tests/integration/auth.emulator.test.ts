// Real integration tests against the Firebase Auth + Firestore emulators
// (firebase.json: auth 9099, firestore 8080) — run via
// `firebase emulators:exec --only firestore,storage,auth "jest --config
// jest.rules.config.js"` (see package.json's test:rules). No mocks: this
// exercises the ACTUAL Firebase JS SDK against a live (local) Auth backend,
// proving the assumptions our production wrapper
// (src/services/firebase/auth.ts, authService.ts) relies on — real
// credential.user shape, real onAuthStateChanged firing, real
// sendEmailVerification success, real error codes for
// email-already-in-use/wrong-password — rather than a hand-constructed
// mock. WHICH SDK function our own wrapper code calls, and with which
// arguments, stays covered separately by the mocked unit tests
// (tests/unit/registerRetry.test.ts, verificationEmail.test.ts,
// signOutFlow.test.ts) — this file's job is to prove the SDK itself
// actually behaves the way those mocks assume it does.
//
// No real email is ever sent and no rate limit is ever risked: the Auth
// emulator fakes email delivery entirely (it queues verification links
// locally, inspectable only via the emulator's own REST API), so this is
// safe to run as often as needed.
//
// Uses the raw firebase/auth + firebase/firestore SDKs directly (its own
// initializeApp/connectAuthEmulator), not src/services/firebase/config.ts —
// that module resolves a platform-specific persistence layer
// (initAuth.native.ts's getReactNativePersistence, via Metro's platform
// file resolution) that plain Jest (unlike Metro) cannot resolve, and it
// also requires real EXPO_PUBLIC_FIREBASE_* env vars at import time. Using
// the SDK directly here avoids depending on either.

import { deleteApp, FirebaseApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, Firestore, getFirestore, setDoc } from "firebase/firestore";

const PROJECT_ID = "netflow-edu-auth-emulator-test";

let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;
let userCounter = 0;

function nextEmail(): string {
  userCounter += 1;
  return `auth-emulator-test-${Date.now()}-${userCounter}@example.com`;
}

const PASSWORD = "Valid123!";

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID, apiKey: "fake-api-key-for-emulator-only" });
  auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
});

afterAll(async () => {
  await deleteApp(app);
});

afterEach(async () => {
  if (auth.currentUser) {
    await signOut(auth);
  }
});

describe("Firebase Auth emulator — registration/verification-email flow", () => {
  it("createUserWithEmailAndPassword returns credential.user with a real uid, and auth.currentUser matches it", async () => {
    const email = nextEmail();
    const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);

    expect(credential.user.uid).toBeTruthy();
    expect(credential.user.email).toBe(email);
    expect(auth.currentUser?.uid).toBe(credential.user.uid);
  });

  // Directly proves the assumption behind registerStudent's
  // `sendVerificationEmail(user)` call: passing the exact user object
  // returned from account creation (credential.user) is a valid,
  // immediately-usable argument — not, say, requiring a reload() first.
  it("sendEmailVerification succeeds when called with credential.user immediately after account creation", async () => {
    const email = nextEmail();
    const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);

    await expect(sendEmailVerification(credential.user)).resolves.toBeUndefined();
  });

  it("a freshly created user is NOT emailVerified until the verification flow actually completes", async () => {
    const email = nextEmail();
    const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    expect(credential.user.emailVerified).toBe(false);
  });

  // Proves AuthProvider's single onAuthStateChanged subscription (the sole
  // writer of its `firebaseUser` state) will actually observe a
  // just-created account — the assumption the whole "single source of
  // truth" design from previous fixes depends on.
  it("onAuthStateChanged fires with the new user shortly after account creation", async () => {
    const email = nextEmail();
    const seenUids: (string | null)[] = [];
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      seenUids.push(user?.uid ?? null);
    });

    const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(seenUids).toContain(credential.user.uid);
    unsubscribe();
  });

  // Proves the "Çıkış Yap" fix's core assumption: signOut() really does
  // flip the listener to null, which is what RouteGuard's isAuthenticated
  // depends on to actually navigate away.
  it("onAuthStateChanged fires with null after signOut", async () => {
    const email = nextEmail();
    await createUserWithEmailAndPassword(auth, email, PASSWORD);

    const seenUids: (string | null)[] = [];
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      seenUids.push(user?.uid ?? null);
    });

    await signOut(auth);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(seenUids[seenUids.length - 1]).toBeNull();
    unsubscribe();
  });

  // Proves registerStudent's retry-path guard (isEmailAlreadyInUse) is
  // checking a code the real SDK actually throws, not a code we invented.
  it("registering the same email twice throws a real auth/email-already-in-use FirebaseError", async () => {
    const email = nextEmail();
    await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await signOut(auth);

    await expect(createUserWithEmailAndPassword(auth, email, PASSWORD)).rejects.toMatchObject({
      code: "auth/email-already-in-use",
    });
  });

  // Proves the retry path's OWN follow-up action (signInWithPassword) is
  // sound: signing back into the same email after an already-in-use error
  // returns the SAME account, not a different/new one.
  it("signing back into an existing account after email-already-in-use returns the SAME uid", async () => {
    const email = nextEmail();
    const first = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await signOut(auth);

    const second = await signInWithEmailAndPassword(auth, email, PASSWORD);
    expect(second.user.uid).toBe(first.user.uid);
  });

  it("a wrong password on an existing account throws a real, catchable Firebase error (not a silent failure)", async () => {
    const email = nextEmail();
    await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await signOut(auth);

    await expect(signInWithEmailAndPassword(auth, email, "TotallyWrongPassword!")).rejects.toMatchObject(
      { code: expect.stringMatching(/^auth\/(invalid-credential|wrong-password)$/) },
    );
  });

  // resendVerificationEmail has no special-casing for "already verified" —
  // proves calling sendEmailVerification a second time on the same
  // unverified user is safe (resolves, doesn't throw), matching the resend
  // button's assumption that it can always be pressed again.
  it("sendEmailVerification can be called more than once for the same still-unverified user without throwing", async () => {
    const email = nextEmail();
    const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);

    await expect(sendEmailVerification(credential.user)).resolves.toBeUndefined();
    await expect(sendEmailVerification(credential.user)).resolves.toBeUndefined();
  });
});

describe("Firebase Auth + Firestore emulator — security boundary against a REAL authenticated identity", () => {
  // firestore.rules.test.ts already proves this using @firebase/rules-unit-
  // testing's SIMULATED auth contexts (a fabricated token/claims, never a
  // real sign-in). This test proves the same boundary holds for a genuine
  // Auth-emulator-issued identity and ID token — a strictly stronger check,
  // since it also exercises real token issuance/propagation, not just a
  // hand-constructed claims object.
  it("a real authenticated user cannot create their own users/{uid} profile document directly — only the Cloud Function may (allow create: if false)", async () => {
    const email = nextEmail();
    const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);

    await expect(
      setDoc(doc(firestore, "users", credential.user.uid), {
        uid: credential.user.uid,
        email,
        role: "student",
        organizationId: null,
        totalPoints: 0,
        weeklyPoints: 999999, // if this ever succeeded, a student could grant themselves points
        accountStatus: "active",
        emailVerified: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("a real authenticated user CAN read their own (possibly nonexistent) users/{uid} path without a permission error", async () => {
    const email = nextEmail();
    const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);

    const snapshot = await getDoc(doc(firestore, "users", credential.user.uid));
    // No onUserCreate Cloud Function is running in this emulator session
    // (functions emulator isn't started for test:rules), so the doc
    // genuinely doesn't exist yet — the important assertion is that the
    // READ itself was allowed (isOwner), not denied.
    expect(snapshot.exists()).toBe(false);
  });

  it("a real authenticated user CANNOT read a DIFFERENT user's users/{uid} document", async () => {
    const emailA = nextEmail();
    await createUserWithEmailAndPassword(auth, emailA, PASSWORD);
    await signOut(auth);

    const emailB = nextEmail();
    await createUserWithEmailAndPassword(auth, emailB, PASSWORD);
    // Reading some other random uid's profile as the currently signed-in
    // user (emailB) must be denied regardless of whether it exists.
    await expect(getDoc(doc(firestore, "users", "some-other-uid-entirely"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});
