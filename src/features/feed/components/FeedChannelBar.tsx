import { memo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { FeedChannel, FeedChannelDescriptor } from "../services/feedChannels";

interface FeedChannelBarProps {
  channels: readonly FeedChannelDescriptor[];
  activeChannel: FeedChannel | null;
  onSelect: (channel: FeedChannel) => void;
}

// Phase 50 — the feed's channel selector.
//
// Horizontally scrollable, one line, compact. Presentational only: it
// renders the descriptors it is given and reports taps; it never decides
// which channels exist (that is feedChannels.ts's job, role-aware) and
// never fetches.
//
// The active state is deliberately carried by BOTH a filled background and
// a weight change, not colour alone (§44) — colour-only selection fails for
// low-vision and colour-blind users, and the accessibilityState below makes
// it explicit to screen readers regardless of either.
function FeedChannelBarComponent({ channels, activeChannel, onSelect }: FeedChannelBarProps) {
  useThemeSubscription();

  // A role with no channels (admin, or the brief pre-profile window) gets no
  // bar at all rather than an empty strip — see channelsForRole's own note.
  if (channels.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        // Keeps the row from stretching its children to the tallest one and
        // leaving tap targets inconsistent between short/long labels.
        alwaysBounceHorizontal={false}
      >
        {channels.map((channel) => {
          const isActive = channel.id === activeChannel;
          return (
            <Pressable
              key={channel.id}
              onPress={() => onSelect(channel.id)}
              style={[styles.chip, isActive ? styles.chipActive : styles.chipInactive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={channel.label}
            >
              <Text style={[styles.chipText, isActive ? styles.chipTextActive : styles.chipTextInactive]}>
                {channel.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const FeedChannelBar = memo(FeedChannelBarComponent);

const styles = themedStyles(() => ({
  wrapper: {
    backgroundColor: colors.background,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    // 40pt total height with the label's own line height — comfortably
    // above the 44pt-with-slop guidance once the row padding is counted,
    // without the oversized pills §6 explicitly rules out.
    paddingVertical: spacing.xs,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chipText: {
    ...typography.label,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: "700",
  },
  chipTextInactive: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
}));
