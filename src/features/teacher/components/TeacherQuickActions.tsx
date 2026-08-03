import { StyleSheet, View } from "react-native";

import { ActionTile } from "@components/ui/ActionTile";
import { spacing } from "@theme/spacing";

interface TeacherQuickActionsProps {
  onCreateClass: () => void;
  onOpenFriends: () => void;
  onFindFriends: () => void;
  onOpenProfile: () => void;
}

// Four actions, every one of which already existed and already works —
// nothing here is a placeholder or a new feature wearing a button's
// clothes. "Yeni Sınıf" opens the same CreateClassModal the old header
// button did; the other three push routes that already exist under
// app/(teacher)/.
//
// Rendered as one row of ActionTile (the icon-over-label primitive added
// in Phase 12A that no screen had adopted yet) instead of stacked
// full-width PrimaryButtons, so four actions cost one row instead of four.
export function TeacherQuickActions({
  onCreateClass,
  onOpenFriends,
  onFindFriends,
  onOpenProfile,
}: TeacherQuickActionsProps) {
  return (
    <View style={styles.row}>
      <ActionTile
        icon="add-circle-outline"
        label="Yeni Sınıf"
        onPress={onCreateClass}
        style={styles.tile}
      />
      <ActionTile
        icon="people-outline"
        label="Arkadaşlar"
        onPress={onOpenFriends}
        style={styles.tile}
      />
      <ActionTile
        icon="person-add-outline"
        label="Arkadaş Bul"
        onPress={onFindFriends}
        style={styles.tile}
      />
      <ActionTile
        icon="person-circle-outline"
        label="Profil"
        onPress={onOpenProfile}
        style={styles.tile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  // Equal-width cells, and `minWidth: 0` deliberately overrides
  // ActionTile's own 84pt minimum: with four tiles the row has to fit the
  // narrowest supported phone without horizontal overflow, so the labels
  // ellipsize instead of pushing the row wider than the screen.
  tile: {
    flex: 1,
    minWidth: 0,
  },
});
