import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { IconButton } from "@components/ui/IconButton";
import { RoleBadge } from "@components/ui/RoleBadge";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { minTouchTarget } from "@theme/sizes";
import { themedStyles } from "@theme/themeRuntime";
import { KnownAccount } from "@services/firebase/accountRegistry";

import { AccountRowPresentation } from "../services/accountSwitchPresentation";

interface AccountRowProps {
  account: KnownAccount;
  presentation: AccountRowPresentation;
  onAction: () => void;
  onRemove?: () => void;
  // Overrides the presentation's default verb where the surrounding screen
  // words it differently ("Devam Et" on the login screen vs "Bu hesaba geç"
  // in the switcher). The STATE-driven labels — "Geçiliyor…", "Tekrar giriş
  // yap" — always win, because those describe what is actually true.
  switchableActionLabel?: string;
}

// One row implementation for both the Account Switcher sheet and the login
// screen's Recent Accounts list. Both previously had their own copy with
// its own hardcoded hex palette, its own avatar-or-placeholder branch and
// its own role-label map.
//
// Geometry is fixed across every state: the action slot keeps its width
// whether it holds a label, a spinner or a checkmark, so a row never
// resizes mid-switch and the list never jumps under the finger.
export function AccountRow({
  account,
  presentation,
  onAction,
  onRemove,
  switchableActionLabel,
}: AccountRowProps) {
  const actionLabel =
    presentation.state === "switchable" && switchableActionLabel
      ? switchableActionLabel
      : presentation.actionLabel;

  return (
    <View style={[styles.row, presentation.state === "current" ? styles.rowCurrent : null]}>
      <Avatar photoURL={account.photoURL} displayName={presentation.primaryLine} size="md" />

      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {presentation.primaryLine}
        </Text>
        <Text style={styles.secondary} numberOfLines={1}>
          {presentation.secondaryLine}
        </Text>
        {presentation.statusLabel ? (
          <Text
            style={[
              styles.status,
              presentation.state === "needs_reauth" ? styles.statusWarning : null,
            ]}
            numberOfLines={1}
          >
            {presentation.statusLabel}
          </Text>
        ) : null}
        {account.role ? (
          <View style={styles.badgeRow}>
            <RoleBadge role={account.role} />
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <View style={styles.actionSlot}>
          {presentation.state === "current" ? (
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          ) : presentation.state === "switching" ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <AnimatedPressable
              onPress={onAction}
              disabled={presentation.isActionDisabled}
              style={[
                styles.actionButton,
                presentation.state === "needs_reauth" ? styles.actionButtonWarning : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={presentation.accessibilityLabel}
              accessibilityState={{ disabled: presentation.isActionDisabled }}
            >
              <Text
                style={[
                  styles.actionText,
                  presentation.state === "needs_reauth" ? styles.actionTextWarning : null,
                ]}
                numberOfLines={1}
              >
                {actionLabel}
              </Text>
            </AnimatedPressable>
          )}
        </View>

        {presentation.canRemove && onRemove ? (
          <IconButton
            icon="close-circle-outline"
            onPress={onRemove}
            size="sm"
            color={colors.textTertiary}
            // Names the destructive scope explicitly: this removes the
            // account from the DEVICE, it does not delete it.
            accessibilityLabel={`${presentation.primaryLine} hesabını bu cihazdan kaldır`}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    minHeight: minTouchTarget + spacing.sm,
  },
  // The current account is marked by a tinted surface AND a checkmark, so
  // it is not identified by colour alone.
  rowCurrent: {
    backgroundColor: colors.primaryMuted,
  },
  identity: {
    flex: 1,
    // Without this a long email refuses to shrink and pushes the action
    // button off the right edge on a compact width.
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  secondary: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  status: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusWarning: {
    color: colors.danger,
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  actionSlot: {
    minWidth: 96,
    minHeight: minTouchTarget,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  actionButton: {
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonWarning: {
    borderColor: colors.danger,
  },
  actionText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  actionTextWarning: {
    color: colors.danger,
  },
}));
