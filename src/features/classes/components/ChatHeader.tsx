import { Href } from "expo-router";
import { Text, View } from "react-native";

import { AppBackButton } from "@components/ui/AppBackButton";
import { Divider } from "@components/ui/Divider";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

interface ChatHeaderProps {
  /** Phase 102 — the class this chat belongs to, for the no-history fallback. */
  fallbackHref: Href;
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
export function ChatHeader({ fallbackHref }: ChatHeaderProps) {
  return (
    <View>
      <View style={styles.row}>
        <AppBackButton fallbackHref={fallbackHref} />
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

const styles = themedStyles(() => ({
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
}));
