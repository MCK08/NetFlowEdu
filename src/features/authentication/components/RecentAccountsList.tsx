import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FormError } from "@components/ui/FormError";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { KnownAccount } from "@services/firebase/accountRegistry";

import { AccountRow } from "./AccountRow";
import {
  decideAccountSwitchIntent,
  presentAccountRow,
  resolveAccountRowState,
  resolveSwitchOutcome,
} from "../services/accountSwitchPresentation";
import { SESSION_REQUIRES_REAUTH_MESSAGE } from "../services/errorMapper";

interface RecentAccountsListProps {
  accounts: KnownAccount[];
  // Resolves to whether the stored session was still valid. A `false` used
  // to be discarded here, so a dead account's "Devam Et" button simply
  // stopped spinning and gave no explanation at all.
  onContinue: (account: KnownAccount) => Promise<boolean>;
  onUseAnotherAccount: () => void;
}

// Shown above LoginScreen's email/password form when this device remembers
// a prior session. "Devam Et" reuses the exact same switchAccount mechanism
// as the Account Switcher — no sign-in logic is duplicated here.
//
// Unlike the switcher, this list has no "current account": nobody is signed
// in on the login screen. Every row is either switchable or, once an
// attempt has proven the stored session gone, marked as needing a real
// sign-in with the form directly below.
export function RecentAccountsList({
  accounts,
  onContinue,
  onUseAnotherAccount,
}: RecentAccountsListProps) {
  const [continuingUid, setContinuingUid] = useState<string | null>(null);
  const [reauthRequiredUids, setReauthRequiredUids] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  async function handleAction(account: KnownAccount) {
    const intent = decideAccountSwitchIntent({
      targetUid: account.uid,
      // Nobody is signed in on this screen, so no row can be "current".
      currentUid: null,
      switchingUid: continuingUid,
      reauthRequiredUids,
    });

    if (intent.kind === "busy" || intent.kind === "noop") return;
    if (intent.kind === "reauthenticate") {
      // Deliberately does NOT collapse the list: the email/password form is
      // already directly below on this screen, and hiding the rows would
      // take the message with them.
      setNotice(SESSION_REQUIRES_REAUTH_MESSAGE);
      return;
    }

    setNotice(null);
    setContinuingUid(account.uid);
    try {
      const outcome = resolveSwitchOutcome(account.uid, await onContinue(account));
      if (outcome.kind === "activated") return;
      setReauthRequiredUids((uids) => (uids.includes(outcome.uid) ? uids : [...uids, outcome.uid]));
      setNotice(SESSION_REQUIRES_REAUTH_MESSAGE);
    } finally {
      setContinuingUid(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bu cihazda daha önce giriş yapıldı</Text>

      <FormError message={notice} />

      {accounts.map((account) => {
        const state = resolveAccountRowState({
          uid: account.uid,
          currentUid: null,
          switchingUid: continuingUid,
          reauthRequiredUids,
        });
        return (
          <AccountRow
            key={account.uid}
            account={account}
            presentation={presentAccountRow(
              {
                uid: account.uid,
                displayName: account.displayName,
                username: account.username,
                email: account.email,
                role: account.role,
              },
              state,
            )}
            switchableActionLabel="Devam Et"
            onAction={() => handleAction(account)}
          />
        );
      })}

      <PrimaryButton
        label="Başka Hesap Kullan"
        onPress={onUseAnotherAccount}
        disabled={continuingUid !== null}
        variant="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  title: {
    ...typography.label,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
