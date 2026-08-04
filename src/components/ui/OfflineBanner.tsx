import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useNetworkStatus } from "@hooks/useNetworkStatus";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

// Mounted once at the root layout — a single global badge rather than each
// screen re-implementing its own connectivity check. Renders nothing while
// online, so it adds no visual/layout cost to the happy path.
export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <Text
      style={[styles.banner, { paddingTop: insets.top + spacing.xxs }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={14} color={colors.textInverse} /> İnternet bağlantısı yok
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    ...typography.caption,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: colors.danger,
    color: colors.textInverse,
    textAlign: "center",
    paddingBottom: spacing.xxs,
  },
});
