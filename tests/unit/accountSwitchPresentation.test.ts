import {
  AccountIdentity,
  accountPrimaryLine,
  accountSecondaryLine,
  CURRENT_ACCOUNT_STATUS,
  decideAccountSwitchIntent,
  presentAccountRow,
  removeAccountConfirmation,
  resolveAccountRowState,
  resolveSwitchOutcome,
  SESSION_EXPIRED_ACTION,
  SESSION_EXPIRED_STATUS,
} from "@features/authentication/services/accountSwitchPresentation";

const STUDENT: AccountIdentity = {
  uid: "uid-student",
  displayName: "Ada Yılmaz",
  username: "ada",
  email: "ada@example.com",
  role: "student",
};

const TEACHER: AccountIdentity = {
  uid: "uid-teacher",
  displayName: "Sinem Hoca",
  username: null,
  email: "sinem@example.com",
  role: "teacher",
};

describe("identity lines", () => {
  it("prefers the username over the address", () => {
    expect(accountSecondaryLine(STUDENT)).toBe("@ada");
  });

  it("falls back to the address when there is no username", () => {
    expect(accountSecondaryLine(TEACHER)).toBe("sinem@example.com");
  });

  it("falls back to a neutral name rather than rendering an empty row", () => {
    expect(accountPrimaryLine({ ...STUDENT, displayName: "   " })).toBe("Kullanıcı");
  });
});

describe("resolveAccountRowState", () => {
  const base = { currentUid: "uid-student", switchingUid: null, reauthRequiredUids: [] };

  it("marks the signed-in account as current", () => {
    expect(resolveAccountRowState({ ...base, uid: "uid-student" })).toBe("current");
  });

  it("marks any other stored account as switchable", () => {
    expect(resolveAccountRowState({ ...base, uid: "uid-teacher" })).toBe("switchable");
  });

  it("marks only the row actually being switched as switching", () => {
    expect(
      resolveAccountRowState({ ...base, uid: "uid-teacher", switchingUid: "uid-teacher" }),
    ).toBe("switching");
    expect(
      resolveAccountRowState({ ...base, uid: "uid-other", switchingUid: "uid-teacher" }),
    ).toBe("switchable");
  });

  // The expired state is only ever reachable AFTER a failed attempt —
  // Firebase exposes no way to know beforehand, so this list is populated
  // by resolveSwitchOutcome, never guessed.
  it("marks an account whose stored session was proven gone as needing re-authentication", () => {
    expect(
      resolveAccountRowState({ ...base, uid: "uid-teacher", reauthRequiredUids: ["uid-teacher"] }),
    ).toBe("needs_reauth");
  });

  it("still reports the current account as current even if it is in the expired list", () => {
    expect(
      resolveAccountRowState({ ...base, uid: "uid-student", reauthRequiredUids: ["uid-student"] }),
    ).toBe("current");
  });

  it("treats a signed-out screen (no current account) as having no current row", () => {
    expect(
      resolveAccountRowState({ ...base, currentUid: null, uid: "uid-student" }),
    ).toBe("switchable");
  });
});

describe("presentAccountRow", () => {
  it("gives the current account no action and no remove control", () => {
    const row = presentAccountRow(STUDENT, "current");
    expect(row.actionLabel).toBeNull();
    expect(row.isActionDisabled).toBe(true);
    expect(row.canRemove).toBe(false);
    expect(row.statusLabel).toBe(CURRENT_ACCOUNT_STATUS);
  });

  it("offers a switch for a stored account", () => {
    const row = presentAccountRow(TEACHER, "switchable");
    expect(row.actionLabel).not.toBeNull();
    expect(row.isActionDisabled).toBe(false);
    expect(row.canRemove).toBe(true);
    // A plain switchable row needs no status line — the action says it.
    expect(row.statusLabel).toBeNull();
  });

  it("disables the action while a switch is in flight", () => {
    const row = presentAccountRow(TEACHER, "switching");
    expect(row.isActionDisabled).toBe(true);
    expect(row.canRemove).toBe(false);
  });

  // The whole point of the expired state: the row must ask for a real
  // sign-in, not keep offering a switch that cannot work.
  it("asks an expired account for a real sign-in instead of another switch", () => {
    const row = presentAccountRow(TEACHER, "needs_reauth");
    expect(row.statusLabel).toBe(SESSION_EXPIRED_STATUS);
    expect(row.actionLabel).toBe(SESSION_EXPIRED_ACTION);
    expect(row.isActionDisabled).toBe(false);
  });

  it("spells every state out for a screen reader instead of relying on colour", () => {
    expect(presentAccountRow(STUDENT, "current").accessibilityLabel).toContain(
      CURRENT_ACCOUNT_STATUS,
    );
    expect(presentAccountRow(TEACHER, "needs_reauth").accessibilityLabel).toContain(
      SESSION_EXPIRED_STATUS,
    );
    expect(presentAccountRow(TEACHER, "switching").accessibilityLabel).toContain("geçiliyor");
  });

  it("includes the role in the accessibility label when there is one, and omits it cleanly when there isn't", () => {
    expect(presentAccountRow(STUDENT, "switchable").accessibilityLabel).toContain("Öğrenci");
    const roleless = presentAccountRow({ ...STUDENT, role: null }, "switchable");
    expect(roleless.accessibilityLabel).not.toContain("undefined");
    expect(roleless.accessibilityLabel).not.toContain("null");
    expect(roleless.accessibilityLabel).not.toContain(", .");
  });

  it("never shows a session-expiry time, last-seen or online state — none of which exist", () => {
    for (const state of ["current", "switchable", "switching", "needs_reauth"] as const) {
      const row = presentAccountRow(TEACHER, state);
      const text = `${row.statusLabel ?? ""} ${row.accessibilityLabel}`.toLowerCase();
      for (const forbidden of ["çevrimiçi", "son görülme", "dakika", "saat önce"]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});

describe("decideAccountSwitchIntent", () => {
  const base = {
    currentUid: "uid-student",
    switchingUid: null as string | null,
    reauthRequiredUids: [] as string[],
  };

  it("does nothing for the account that is already active", () => {
    expect(decideAccountSwitchIntent({ ...base, targetUid: "uid-student" })).toEqual({
      kind: "noop",
    });
  });

  it("attempts an instant switch for another stored account", () => {
    expect(decideAccountSwitchIntent({ ...base, targetUid: "uid-teacher" })).toEqual({
      kind: "switch",
    });
  });

  // THE invariant this module exists for: once a stored session has been
  // proven gone, tapping the row must go to a real sign-in. Silently
  // retrying a switch would spin and fail again with no explanation.
  it("sends an account with a known-gone session to re-authentication, never to another switch", () => {
    expect(
      decideAccountSwitchIntent({
        ...base,
        targetUid: "uid-teacher",
        reauthRequiredUids: ["uid-teacher"],
      }),
    ).toEqual({ kind: "reauthenticate" });
  });

  // Duplicate-submit guard: a second tap while a switch is running must be
  // dropped entirely, not queued behind the first.
  it("drops every tap while a switch is already in flight", () => {
    expect(
      decideAccountSwitchIntent({
        ...base,
        targetUid: "uid-teacher",
        switchingUid: "uid-teacher",
      }),
    ).toEqual({ kind: "busy" });
    expect(
      decideAccountSwitchIntent({ ...base, targetUid: "uid-other", switchingUid: "uid-teacher" }),
    ).toEqual({ kind: "busy" });
    // Even the current account: closing the sheet mid-switch would strand
    // the in-flight operation with nothing listening for its result.
    expect(
      decideAccountSwitchIntent({ ...base, targetUid: "uid-student", switchingUid: "uid-teacher" }),
    ).toEqual({ kind: "busy" });
  });
});

describe("resolveSwitchOutcome", () => {
  it("reports a successful switch as activated", () => {
    expect(resolveSwitchOutcome("uid-teacher", true)).toEqual({ kind: "activated" });
  });

  // switchToStoredAccount returns null when the stored session is gone. That
  // is not a credential failure and never touches the currently active
  // account — the only consequence is that THIS account now needs a password.
  it("reports a failed switch as requiring re-authentication for that exact account", () => {
    expect(resolveSwitchOutcome("uid-teacher", false)).toEqual({
      kind: "requires_reauthentication",
      uid: "uid-teacher",
    });
  });
});

describe("removeAccountConfirmation", () => {
  it("names the account and says the removal is local, not a deletion", () => {
    const confirmation = removeAccountConfirmation(STUDENT);
    expect(confirmation.message).toContain("Ada Yılmaz");
    expect(confirmation.message).toContain("cihaz");
    expect(confirmation.message).toContain("silinmez");
  });

  it("does not promise anything about the server-side account beyond that it survives", () => {
    const message = removeAccountConfirmation(STUDENT).message.toLowerCase();
    expect(message).not.toContain("kalıcı");
    expect(message).not.toContain("geri alınamaz");
  });
});
