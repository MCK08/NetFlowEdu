import { memo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import type { FeedChannel, FeedChannelDescriptor } from "../services/feedChannels";

export const ALL_SUBJECTS_LABEL = "Tümü";

interface FeedScopeBarProps {
  /** Phase 50's channels for this role — never a list assembled here. */
  channels: readonly FeedChannelDescriptor[];
  activeChannel: FeedChannel | null;
  onSelectChannel: (channel: FeedChannel) => void;
  /** The product's own subject taxonomy. */
  subjects: readonly string[];
  /** null means "Tümü". */
  selectedSubject: string | null;
  onSelectSubject: (subject: string | null) => void;
}

// Phase 116 — what the feed is showing, in one line you can reach.
//
// This replaces SubjectPillBar's subjects-only row. The CHANNEL was the
// problem: "Derslerim" is where a student's class questions live, and
// reaching it meant opening the filter sheet, finding the channel group and
// applying — three taps to answer "show me my class's questions", while the
// row across the top offered only subjects. Both are the same question
// ("what am I looking at?"), so both are pills now.
//
// Channels lead because they change WHICH pool is drawn from; subjects
// narrow whatever that pool returned. The divider says that out loud, and
// the two groups keep separate accessibility labels so a screen reader is
// not handed thirteen undifferentiated tabs.
//
// Nothing here ranks, fetches or filters: it reports the selection to
// FeedScreen, which owns the same state the filter sheet writes. Selecting
// a channel from here and from the sheet are the same action.
function FeedScopeBarComponent({
  channels,
  activeChannel,
  onSelectChannel,
  subjects,
  selectedSubject,
  onSelectSubject,
}: FeedScopeBarProps) {
  useThemeSubscription();
  const subjectOptions: (string | null)[] = [null, ...subjects];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      alwaysBounceHorizontal={false}
      accessibilityRole="tablist"
    >
      {channels.map((channel) => {
        const isActive = channel.id === activeChannel;
        return (
          <Pressable
            key={channel.id}
            onPress={() => onSelectChannel(channel.id)}
            style={[styles.pill, isActive ? styles.pillActive : null]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={channel.label}
          >
            <Text style={[styles.label, isActive ? styles.labelActive : null]}>{channel.label}</Text>
          </Pressable>
        );
      })}

      {channels.length > 0 ? <View style={styles.divider} /> : null}

      {subjectOptions.map((subject) => {
        const isActive = subject === selectedSubject;
        const label = subject ?? ALL_SUBJECTS_LABEL;
        return (
          <Pressable
            key={label}
            onPress={() => onSelectSubject(subject)}
            style={[styles.pill, isActive ? styles.pillActive : null]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={subject ? `${subject} soruları` : "Tüm dersler"}
          >
            <Text style={[styles.label, isActive ? styles.labelActive : null]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const FeedScopeBar = memo(FeedScopeBarComponent);

const styles = themedStyles(() => ({
  content: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
  pill: {
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    // Selection is carried by fill AND weight AND the accessibility state,
    // never colour alone.
    minHeight: minTouchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  labelActive: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textInverse,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: spacing.xs,
    marginHorizontal: spacing.xxs,
    backgroundColor: colors.divider,
  },
}));
