import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Divider } from "@components/ui/Divider";
import { FormError } from "@components/ui/FormError";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { minTouchTarget } from "@theme/sizes";
import { themedStyles } from "@theme/themeRuntime";
import { KnownAccount } from "@services/firebase/accountRegistry";

import { AccountRow } from "./AccountRow";
import { AddAccountForm } from "./AddAccountForm";
import { useAuth } from "../hooks/useAuth";
import {
  decideAccountSwitchIntent,
  presentAccountRow,
  removeAccountConfirmation,
  resolveAccountRowState,
  resolveSwitchOutcome,
} from "../services/accountSwitchPresentation";
import { SESSION_REQUIRES_REAUTH_MESSAGE } from "../services/errorMapper";

// The device account switcher. Same Modal-based sheet pattern as before —
// what changed is that it no longer dead-ends.
//
// Two paths were broken and are now handled in place:
//   * "+ Başka Hesap Ekle" called router.push(ROUTES.login) while still
//     signed in, and RouteGuard immediately replaced that route back to the
//     active account's dashboard. The button visibly did nothing.
//   * A failed switch (the stored local session had expired) showed an
//     Alert and then router.replace(ROUTES.login) — which hit the exact same
//     bounce, because the failed switch leaves the PREVIOUS account signed
//     in, so the user is still authenticated.
// Both now open an in-sheet sign-in that runs on the staging Auth instance
// (AuthProvider.addAccountWithPassword), which is what that API was built
// for and had no caller until now.
export default function AccountSwitcherSheet() {
  const {
    isAccountSwitcherOpen,
    closeAccountSwitcher,
    knownAccounts,
    firebaseUser,
    switchAccount,
    removeAccount,
  } = useAuth();
  const insets = useSafeAreaInsets();

  const [switchingUid, setSwitchingUid] = useState<string | null>(null);
  // uids whose stored session was PROVEN gone by a failed attempt in this
  // session. Never guessed up front: switchToStoredAccount is the only thing
  // that can tell, and it can only tell by trying.
  const [reauthRequiredUids, setReauthRequiredUids] = useState<string[]>([]);
  const [pendingReauth, setPendingReauth] = useState<KnownAccount | null>(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function dismiss() {
    setPendingReauth(null);
    setIsAddingAccount(false);
    setNotice(null);
    closeAccountSwitcher();
  }

  async function handleRowAction(account: KnownAccount) {
    const intent = decideAccountSwitchIntent({
      targetUid: account.uid,
      currentUid: firebaseUser?.uid ?? null,
      switchingUid,
      reauthRequiredUids,
    });

    if (intent.kind === "busy") return;
    if (intent.kind === "noop") {
      closeAccountSwitcher();
      return;
    }
    if (intent.kind === "reauthenticate") {
      setNotice(null);
      setPendingReauth(account);
      return;
    }

    setNotice(null);
    setSwitchingUid(account.uid);
    try {
      const outcome = resolveSwitchOutcome(account.uid, await switchAccount(account.uid));
      if (outcome.kind === "activated") {
        // No routing here: the new session flows through AuthProvider and
        // RouteGuard recomputes the destination from the NEW account's own
        // role. A screen that navigated as well would be a second owner of
        // that decision.
        dismiss();
        return;
      }
      // The previous account is still signed in — a failed switch never
      // touches the default Auth instance. Offer the real recovery instead
      // of claiming anything happened.
      setReauthRequiredUids((uids) => (uids.includes(outcome.uid) ? uids : [...uids, outcome.uid]));
      setNotice(SESSION_REQUIRES_REAUTH_MESSAGE);
      setPendingReauth(account);
    } finally {
      setSwitchingUid(null);
    }
  }

  function confirmRemove(account: KnownAccount) {
    const { title, message, confirmLabel } = removeAccountConfirmation({
      uid: account.uid,
      displayName: account.displayName,
      username: account.username,
      email: account.email,
      role: account.role,
    });
    Alert.alert(title, message, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: confirmLabel,
        style: "destructive",
        onPress: () => {
          setReauthRequiredUids((uids) => uids.filter((uid) => uid !== account.uid));
          removeAccount(account.uid);
        },
      },
    ]);
  }

  const showingForm = isAddingAccount || pendingReauth !== null;

  return (
    <Modal
      visible={isAccountSwitcherOpen}
      transparent
      animationType="slide"
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouchable} onPress={dismiss} accessibilityLabel="Kapat" />
        {/* Exactly one KeyboardAvoidingView, and only around the sheet — the
            in-sheet sign-in form must clear the keyboard, and the auth
            screens' own AuthShell is never mounted inside this. */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.grabber} />

            {showingForm ? (
              <AddAccountForm
                initialEmail={pendingReauth?.email}
                title={pendingReauth ? "Tekrar giriş yap" : "Başka hesap ekle"}
                description={
                  pendingReauth
                    ? SESSION_REQUIRES_REAUTH_MESSAGE
                    : "Mevcut hesabından çıkmadan ikinci bir hesap ekleyebilirsin."
                }
                onCancel={() => {
                  setPendingReauth(null);
                  setIsAddingAccount(false);
                  setNotice(null);
                }}
                onAdded={dismiss}
              />
            ) : (
              <>
                <Text style={styles.title}>Hesaplar</Text>

                <FormError message={notice} />

                {/* Bounded height so a long account list scrolls instead of
                    growing the sheet past the top of the screen. */}
                <ScrollView
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                >
                  {knownAccounts.map((account) => {
                    const state = resolveAccountRowState({
                      uid: account.uid,
                      currentUid: firebaseUser?.uid ?? null,
                      switchingUid,
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
                        onAction={() => handleRowAction(account)}
                        onRemove={() => confirmRemove(account)}
                      />
                    );
                  })}
                </ScrollView>

                <Divider />

                <AnimatedPressable
                  onPress={() => {
                    setNotice(null);
                    setIsAddingAccount(true);
                  }}
                  style={styles.addButton}
                  accessibilityRole="button"
                  accessibilityLabel="Başka hesap ekle"
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.addButtonText}>Başka Hesap Ekle</Text>
                </AnimatedPressable>

                <Pressable
                  onPress={dismiss}
                  style={styles.cancelButton}
                  accessibilityRole="button"
                  accessibilityLabel="Kapat"
                >
                  <Text style={styles.cancelText}>Kapat</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
    alignSelf: "center",
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  list: {
    // Caps the list, not the sheet: the add/close actions below stay
    // reachable no matter how many accounts this device remembers.
    maxHeight: 320,
  },
  listContent: {
    gap: spacing.xxs,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: minTouchTarget + 8,
  },
  addButtonText: {
    ...typography.subtitle,
    color: colors.primary,
  },
  cancelButton: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
}));
