import { StyleSheet, Text, View } from "react-native";

import { Divider } from "@components/ui/Divider";
import { IconButton } from "@components/ui/IconButton";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface ChatHeaderProps {
  onBack: () => void;
}

// Compact chat header.
//
// Deliberately shows NO class name, member count or avatar: ClassChatScreen
// never loads the class document (its only Firestore work is the message
// listener), and fetching one just to decorate the header would add a read
// this phase is explicitly not allowed to introduce. The title stays the
// honest, static one the screen already used — what changed is the
// structure around it (real back IconButton with a guaranteed 44pt target,
// token typography, a hairline Divider instead of a 1px hardcoded border,
// and a balanced trailing spacer so the title is not pushed off-centre).
export function ChatHeader({ onBack }: ChatHeaderProps) {
  return (
    <View>
      <View style={styles.row}>
        <IconButton
          icon="chevron-back"
          onPress={onBack}
          accessibilityLabel="Geri"
          color={colors.textPrimary}
        />
        <Text style={styles.title} numberOfLines={1}>
          Sınıf Sohbeti
        </Text>
        {/* Mirrors the back button's width so the title sits optically
            centred without a second, non-functional action button. */}
        <View style={styles.trailingSpacer} />
      </View>
      <Divider />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.subtitle,
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  trailingSpacer: {
    width: 44,
  },
});
