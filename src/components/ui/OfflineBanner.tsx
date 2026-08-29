import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useNetworkStatus } from "@hooks/useNetworkStatus";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

// Mounted once at the root layout — a single global badge rather than each
// screen re-implementing its own connectivity check. Renders nothing while
// online, so it adds no visual or layout cost to the happy path.
//
// PHASE 53 — WHY THIS MOVED TO THE BOTTOM
//
// It used to be a full-width bar pinned to `top: 0`, which covered the top
// of whatever screen was showing: screen titles, the feed's brand lockup,
// and back buttons all disappeared behind it while offline (the known
// Phase 51/52 limitation).
//
// Fixing it per-screen would have meant every screen padding itself to dodge
// a global element — the wrong layer. Instead this is now a compact,
// centered pill anchored to the BOTTOM, which structurally cannot overlap a
// title: titles live at the top of every screen in this app.
//
// It floats clear of the tab bar rather than covering it (see TAB_BAR_CLEARANCE)
// and stays absolutely positioned, so it never pushes content or causes a
// layout jump when connectivity flips — the surrounding screen's geometry is
// identical online and offline.
//
// The connectivity source itself is untouched; this is presentation only,
// and it never fakes a state (it renders exclusively off `isOnline`).

// Enough to clear a standard bottom tab bar's own height so the pill reads
// as floating above it rather than sitting on top of its icons. On screens
// with no tab bar it simply floats a little higher than the safe area.
const TAB_BAR_CLEARANCE = 64;

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View
      style={[styles.wrapper, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]}
      pointerEvents="none"
    >
      <View style={styles.pill}>
        <Ionicons name="cloud-offline-outline" size={13} color={colors.textInverse} />
        <Text style={styles.text} accessibilityRole="alert" accessibilityLiveRegion="polite">
          İnternet bağlantısı yok
        </Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  text: {
    ...typography.caption,
    color: colors.textInverse,
  },
}));
