import { UserRole } from "@/types/user";
import { optionalRoleLabel } from "@utils/roleLabels";

// What a single row in the Account Switcher / Recent Accounts list is
// currently doing. Every value here is derived from state this device
// actually has — there is deliberately NO "online", "last seen", or
// "session expires in…": Firebase Auth exposes no such thing, and
// switchToStoredAccount can only discover that a stored session is gone by
// actually attempting the switch.
export type AccountRowState =
  | "current" // the account the app is signed in as right now
  | "switchable" // stored on this device; resume is expected to work
  | "switching" // a switch for THIS row is in flight
  | "needs_reauth"; // a switch was attempted and the local session was gone

export interface AccountIdentity {
  uid: string;
  displayName: string;
  username: string | null;
  email: string;
  role: UserRole | null;
}

export interface AccountRowPresentation {
  state: AccountRowState;
  primaryLine: string;
  // "@username" when there is one, otherwise the address — the only two
  // identifiers this device stores (see accountRegistry.KnownAccount).
  secondaryLine: string;
  // A short, non-interactive description of the row's state. Null for a
  // plain switchable account, where the action label already says it all.
  statusLabel: string | null;
  // Null for the current account: there is nothing to switch to.
  actionLabel: string | null;
  isActionDisabled: boolean;
  // The current account can't be removed from under the running session.
  canRemove: boolean;
  accessibilityLabel: string;
}

const FALLBACK_NAME = "Kullanıcı";

// Shown when a stored session turns out to be gone. Says what the person
// must do, never why it happened in Firebase's terms.
export const SESSION_EXPIRED_STATUS = "Oturum sona ermiş";
export const SESSION_EXPIRED_ACTION = "Tekrar giriş yap";
export const CURRENT_ACCOUNT_STATUS = "Şu anki hesap";

export function accountPrimaryLine(account: AccountIdentity): string {
  return account.displayName.trim() || FALLBACK_NAME;
}

export function accountSecondaryLine(account: AccountIdentity): string {
  const username = account.username?.trim();
  if (username) return `@${username}`;
  return account.email.trim();
}

export function resolveAccountRowState(input: {
  uid: string;
  currentUid: string | null;
  switchingUid: string | null;
  // uids whose stored session was PROVEN gone by a failed switch attempt
  // this session. Never guessed ahead of time.
  reauthRequiredUids: readonly string[];
}): AccountRowState {
  if (input.uid === input.currentUid) return "current";
  if (input.uid === input.switchingUid) return "switching";
  if (input.reauthRequiredUids.includes(input.uid)) return "needs_reauth";
  return "switchable";
}

export function presentAccountRow(
  account: AccountIdentity,
  state: AccountRowState,
): AccountRowPresentation {
  const primaryLine = accountPrimaryLine(account);
  const secondaryLine = accountSecondaryLine(account);
  const role = optionalRoleLabel(account.role);
  const roleSuffix = role ? `, ${role}` : "";

  switch (state) {
    case "current":
      return {
        state,
        primaryLine,
        secondaryLine,
        statusLabel: CURRENT_ACCOUNT_STATUS,
        actionLabel: null,
        isActionDisabled: true,
        canRemove: false,
        // State is spelled out for a screen reader instead of relying on
        // the checkmark/colour that conveys it visually.
        accessibilityLabel: `${primaryLine}${roleSuffix}. ${CURRENT_ACCOUNT_STATUS}.`,
      };
    case "switching":
      return {
        state,
        primaryLine,
        secondaryLine,
        statusLabel: "Geçiliyor…",
        actionLabel: "Geçiliyor…",
        isActionDisabled: true,
        canRemove: false,
        accessibilityLabel: `${primaryLine}${roleSuffix}. Hesaba geçiliyor.`,
      };
    case "needs_reauth":
      return {
        state,
        primaryLine,
        secondaryLine,
        statusLabel: SESSION_EXPIRED_STATUS,
        actionLabel: SESSION_EXPIRED_ACTION,
        isActionDisabled: false,
        canRemove: true,
        accessibilityLabel: `${primaryLine}${roleSuffix}. ${SESSION_EXPIRED_STATUS}. Devam etmek için tekrar giriş yapman gerekiyor.`,
      };
    default:
      return {
        state,
        primaryLine,
        secondaryLine,
        statusLabel: null,
        actionLabel: "Bu hesaba geç",
        isActionDisabled: false,
        canRemove: true,
        accessibilityLabel: `${primaryLine}${roleSuffix}. Bu hesaba geç.`,
      };
  }
}

// What tapping a row should actually DO. Kept separate from presentation so
// the "an expired session cannot silently switch" rule is a testable
// decision rather than a branch buried in a press handler.
export type AccountSwitchIntent =
  // Already signed in as this account — just close the sheet.
  | { kind: "noop" }
  // Another switch is already running; ignore this tap entirely (the
  // duplicate-submit guard).
  | { kind: "busy" }
  // Attempt an instant, password-free resume of the stored session.
  | { kind: "switch" }
  // This account's stored session is already known to be gone — go straight
  // to a real sign-in instead of pretending a switch might work.
  | { kind: "reauthenticate" };

export function decideAccountSwitchIntent(input: {
  targetUid: string;
  currentUid: string | null;
  switchingUid: string | null;
  reauthRequiredUids: readonly string[];
}): AccountSwitchIntent {
  if (input.switchingUid !== null) return { kind: "busy" };
  if (input.targetUid === input.currentUid) return { kind: "noop" };
  if (input.reauthRequiredUids.includes(input.targetUid)) return { kind: "reauthenticate" };
  return { kind: "switch" };
}

// What to do with the result of an attempted switch. A failure must never
// disturb the session that is currently active — switchToStoredAccount only
// touches the default Auth instance once it has a real User — so the only
// consequence is that this account now needs a password.
export type AccountSwitchOutcome =
  | { kind: "activated" }
  | { kind: "requires_reauthentication"; uid: string };

export function resolveSwitchOutcome(uid: string, succeeded: boolean): AccountSwitchOutcome {
  return succeeded ? { kind: "activated" } : { kind: "requires_reauthentication", uid };
}

// Removing an account here revokes its LOCAL session and forgets its
// remembered display metadata. It does not delete anything server-side —
// saying otherwise would be a lie about a destructive action.
export function removeAccountConfirmation(account: AccountIdentity): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  return {
    title: "Hesabı bu cihazdan kaldır",
    message: `${accountPrimaryLine(account)} hesabı bu cihazdan çıkarılacak. Hesap silinmez; istediğin zaman tekrar giriş yapabilirsin.`,
    confirmLabel: "Kaldır",
  };
}
