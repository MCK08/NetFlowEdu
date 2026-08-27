import { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

interface BottomActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

// Generic shell around the Modal-based bottom-sheet pattern already
// established by CreateClassModal/AccountSwitcherSheet (per their own doc
// comments, that IS the app's one shared sheet pattern — this just extracts
// the repeated backdrop+slide-up-panel chrome so a new sheet doesn't
// re-copy it). Not a redesign of AccountSwitcherSheet itself this phase —
// that component keeps its own current markup, this is for future sheets.
// Do NOT use this near an expo-image-picker camera/library launch — see
// VisibilityPicker.tsx/ImageSourcePicker.tsx's doc comments for why a real
// RN <Modal> races with the camera view there; use their custom overlay
// pattern instead in that specific case.
export function BottomActionSheet({ visible, onClose, title, children }: BottomActionSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouchable} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={styles.sheet}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </View>
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
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xxs,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
}));
