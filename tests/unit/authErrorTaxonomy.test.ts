import { FirebaseError } from "firebase/app";

import {
  ADD_ACCOUNT_SUSPENDED_MESSAGE,
  GoogleFailureKind,
  mapAuthErrorToMessage,
  mapGoogleFailureToMessage,
  SESSION_REQUIRES_REAUTH_MESSAGE,
} from "@features/authentication/services/errorMapper";

function firebaseError(code: string): FirebaseError {
  return new FirebaseError(code, `raw sdk text for ${code}`);
}

describe("credential failures stay indistinguishable from each other", () => {
  const CREDENTIAL_MESSAGE = "E-posta veya şifre hatalı.";

  // Newer Firebase builds (email-enumeration protection on) report a bad
  // pair as auth/invalid-login-credentials. Before it was mapped, that
  // turned a simple wrong password into the generic "bir şeyler ters gitti".
  it("maps every bad-credential code, old and new, to the same message", () => {
    for (const code of [
      "auth/invalid-credential",
      "auth/wrong-password",
      "auth/user-not-found",
      "auth/invalid-login-credentials",
    ]) {
      expect(mapAuthErrorToMessage(firebaseError(code))).toBe(CREDENTIAL_MESSAGE);
    }
  });

  // User-enumeration guard: "no such account" and "wrong password" must not
  // be separable by reading the message.
  it("does not let the message reveal whether an address is registered", () => {
    expect(mapAuthErrorToMessage(firebaseError("auth/user-not-found"))).toBe(
      mapAuthErrorToMessage(firebaseError("auth/wrong-password")),
    );
  });
});

describe("a network failure is never phrased as a wrong password", () => {
  it("keeps them distinct", () => {
    const network = mapAuthErrorToMessage(firebaseError("auth/network-request-failed"));
    const credential = mapAuthErrorToMessage(firebaseError("auth/wrong-password"));
    expect(network).not.toBe(credential);
    expect(network).toContain("bağlantı");
  });
});

describe("a configuration failure is never phrased as a credential failure", () => {
  it("keeps auth/operation-not-allowed distinct and blames no one's typing", () => {
    const message = mapAuthErrorToMessage(firebaseError("auth/operation-not-allowed"));
    expect(message).not.toBe(mapAuthErrorToMessage(firebaseError("auth/wrong-password")));
    expect(message.toLowerCase()).not.toContain("şifre");
  });
});

describe("newly mapped codes", () => {
  it("maps the account-linking codes reachable from the profile screen", () => {
    for (const code of [
      "auth/account-exists-with-different-credential",
      "auth/credential-already-in-use",
      "auth/provider-already-linked",
    ]) {
      const message = mapAuthErrorToMessage(firebaseError(code));
      expect(message).not.toBe("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
    }
  });

  it("maps internal/timeout as retryable server-side trouble", () => {
    expect(mapAuthErrorToMessage(firebaseError("auth/internal-error"))).toContain("tekrar");
    expect(mapAuthErrorToMessage(firebaseError("auth/timeout"))).toContain("tekrar");
  });
});

describe("no raw Firebase detail ever reaches the user", () => {
  it("never echoes the code or the SDK's own message", () => {
    for (const code of [
      "auth/invalid-credential",
      "auth/operation-not-allowed",
      "auth/internal-error",
      "auth/some-code-that-does-not-exist",
    ]) {
      const message = mapAuthErrorToMessage(firebaseError(code));
      expect(message).not.toContain(code);
      expect(message).not.toContain("auth/");
      expect(message).not.toContain("raw sdk text");
    }
  });
});

describe("mapGoogleFailureToMessage", () => {
  // Closing the browser sheet is a choice. Showing it as a failure was the
  // exact regression this taxonomy exists to make untestable-by-omission.
  it("shows NOTHING for a cancellation", () => {
    expect(mapGoogleFailureToMessage("cancelled")).toBeNull();
  });

  it("explains a missing token and a failed exchange as retryable, and distinctly", () => {
    const missing = mapGoogleFailureToMessage("missing_token");
    const failed = mapGoogleFailureToMessage("exchange_failed");
    expect(missing).not.toBeNull();
    expect(failed).not.toBeNull();
    expect(missing).not.toBe(failed);
    expect(missing).toContain("tekrar");
    expect(failed).toContain("tekrar");
  });

  it("never leaks a token, a client id or any technical term", () => {
    const kinds: GoogleFailureKind[] = ["cancelled", "missing_token", "exchange_failed"];
    for (const kind of kinds) {
      const message = mapGoogleFailureToMessage(kind)?.toLowerCase() ?? "";
      for (const forbidden of ["token", "client", "oauth", "id_token", "expo_public"]) {
        expect(message).not.toContain(forbidden);
      }
    }
  });
});

describe("session / account-switch messages", () => {
  // switchToStoredAccount returning null means the LOCAL session is gone.
  // Nothing the person typed was wrong, so this must not read as a
  // credential rejection.
  it("tells an expired stored session what to do without blaming the password", () => {
    expect(SESSION_REQUIRES_REAUTH_MESSAGE).toContain("oturum");
    expect(SESSION_REQUIRES_REAUTH_MESSAGE).toContain("giriş");
    expect(SESSION_REQUIRES_REAUTH_MESSAGE).not.toBe("E-posta veya şifre hatalı.");
  });

  it("gives a suspended account added via the switcher a real explanation, not a generic failure", () => {
    expect(ADD_ACCOUNT_SUSPENDED_MESSAGE).toContain("askıya");
    expect(ADD_ACCOUNT_SUSPENDED_MESSAGE).not.toBe("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
  });

  it("neither message exposes an internal code", () => {
    for (const message of [SESSION_REQUIRES_REAUTH_MESSAGE, ADD_ACCOUNT_SUSPENDED_MESSAGE]) {
      expect(message).not.toContain("auth/");
      expect(message).not.toContain("functions/");
      expect(message).not.toContain("client/");
    }
  });
});
