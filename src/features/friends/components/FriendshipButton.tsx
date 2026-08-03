import { Ionicons } from "@expo/vector-icons";
import { Alert, StyleSheet, Text, View } from "react-native";

import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { useFriendshipAction } from "../hooks/useFriendshipAction";
import {
  resolveFriendshipPresentation,
  SocialActionKind,
} from "../services/friendshipPresentation";
import { SocialActionButton } from "./SocialActionButton";

interface FriendshipButtonProps {
  ownUid: string | undefined;
  otherUid: string;
  // The screen already knows whether this is the caller's own profile;
  // passing it in keeps that single source of truth instead of the
  // component re-deriving it.
  isOwnProfile?: boolean;
}

// The friendship action area on a public profile.
//
// All relationship logic still lives in useFriendshipAction (unchanged);
// which controls to draw is now decided by the pure, unit-tested
// resolveFriendshipPresentation mapper rather than by a chain of `if
// (state === ...)` blocks that each re-declared their own labels and
// styles. The previous version also lost the entire action area whenever
// `isMutating` flipped — replaced by a bare centred spinner — which made
// the profile reflow on every tap; the buttons now stay in place.
export function FriendshipButton({ ownUid, otherUid, isOwnProfile = false }: FriendshipButtonProps) {
  const {
    state,
    isLoading,
    isMutating,
    errorMessage,
    sendRequest,
    cancelRequest,
    acceptRequest,
    declineRequest,
    unfriend,
  } = useFriendshipAction(ownUid, otherUid);

  const presentation = resolveFriendshipPresentation({
    buttonState: state,
    isOwnProfile,
    isLoading,
    isMutating,
  });

  if (presentation.view === "hidden") return null;

  if (presentation.view === "loading") {
    // Same footprint as the real action row, so the hero does not shift
    // when the relationship resolves.
    return <LoadingSkeleton width={200} height={44} borderRadius={radius.pill} />;
  }

  function runAction(kind: SocialActionKind) {
    switch (kind) {
      case "add":
        return sendRequest();
      case "cancel":
        return cancelRequest();
      case "accept":
        return acceptRequest();
      case "decline":
        return declineRequest();
      case "remove":
        return unfriend();
    }
  }

  function handlePress(kind: SocialActionKind, requiresConfirmation: boolean) {
    if (!requiresConfirmation) {
      void runAction(kind);
      return;
    }
    // Preserved verbatim from the previous implementation — removing an
    // established friendship is the one action that confirms.
    Alert.alert("Arkadaşlıktan çık", "Bu kişiyi arkadaş listenden çıkarmak istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Çıkar", style: "destructive", onPress: () => void runAction(kind) },
    ]);
  }

  return (
    <View style={styles.container}>
      {presentation.statusLabel ? (
        <Text style={styles.statusLabel}>{presentation.statusLabel}</Text>
      ) : null}

      <View style={styles.actionRow}>
        {presentation.actions.map((action) => (
          <SocialActionButton
            key={action.kind}
            action={action}
            isBusy={presentation.isBusy}
            fill={presentation.actions.length > 1}
            onPress={() => handlePress(action.kind, action.requiresConfirmation)}
          />
        ))}
      </View>

      {errorMessage ? (
        <View style={styles.errorRow} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Ionicons name="warning-outline" size={14} color={colors.danger} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    justifyContent: "center",
    gap: spacing.xs,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.md,
    backgroundColor: colors.dangerMuted,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    flexShrink: 1,
  },
});
