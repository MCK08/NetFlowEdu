import { Ionicons } from "@expo/vector-icons";
import { Fragment } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackButton } from "@components/ui/AppBackButton";
import { useAuth } from "@features/authentication";
import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useTheme } from "@theme/ThemeProvider";
import { ThemePreference } from "@theme/themePreference";
import { typography } from "@theme/typography";

import { profileRoutesFor } from "../routes";

export const APPEARANCE_TITLE = "Görünüm";
export const APPEARANCE_SYSTEM_NOTE =
  "Cihazının ayarına göre otomatik olarak açık veya koyu tema kullanılır.";

interface Option {
  value: ThemePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// The three the theme model actually has — see themePreference.ts, where
// "system" is a real choice ("keep following the OS"), not the absence of
// one. Nothing here invents a fourth.
//
// Order follows the mockup: the two explicit overrides first, then the
// deferral, which is also the default.
const OPTIONS: readonly Option[] = [
  { value: "light", label: "Açık", icon: "sunny-outline" },
  { value: "dark", label: "Koyu", icon: "moon-outline" },
  { value: "system", label: "Sistemle aynı", icon: "phone-portrait-outline" },
] as const;

// Phase 115 — appearance, as its own screen.
//
// It was a three-pill segmented control inside Ayarlar (Phase 49's
// AppearanceSelector). As a row leading here, the setting can say what it
// currently is without the page carrying a control; and as a screen, each
// option gets a full-width row, a real radio, and room for the one sentence
// that explains what "Sistemle aynı" means.
//
// No new theme state: `useTheme` is the same context ThemeProvider has
// always exposed, `setPreference` is the same writer, and persistence stays
// in themeStorage's single AsyncStorage key. The theme applies on tap, so
// there is deliberately no Save button to imply otherwise.
export function AppearanceScreen() {
  const { preference, setPreference } = useTheme();
  const { profile } = useAuth();
  // Back lands on this role's Ayarlar when there is no history to pop —
  // never an unrelated tab. `as never`: expo-router's typed-route union is
  // generated into a gitignored cache (see ../routes.ts).
  const settingsHref = profileRoutesFor(profile?.role).settings as never;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <AppBackButton fallbackHref={settingsHref} />
        <Text style={styles.headerTitle}>{APPEARANCE_TITLE}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tema</Text>
          <Card style={styles.card}>
            {OPTIONS.map((option, index) => {
              // Checked against the stored PREFERENCE, not the resolved
              // theme: with "system" selected on a dark device, "Koyu" is
              // what the app renders but is NOT what the user chose.
              const selected = preference === option.value;
              return (
                <Fragment key={option.value}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    onPress={() => setPreference(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={option.label}
                    style={styles.row}
                  >
                    <Ionicons
                      name={option.icon}
                      size={iconSize.md}
                      color={selected ? colors.primary : colors.textSecondary}
                      accessibilityElementsHidden
                    />
                    <Text style={[styles.label, selected ? styles.labelSelected : null]}>
                      {option.label}
                    </Text>
                    <View style={[styles.radio, selected ? styles.radioSelected : null]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </Pressable>
                </Fragment>
              );
            })}
          </Card>
        </View>

        {/* True of the option above it, and only of that one. */}
        <Text style={styles.note}>{APPEARANCE_SYSTEM_NOTE}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  // Balances the back button so the title stays optically centred.
  headerSpacer: {
    width: minTouchTarget,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xs,
  },
  card: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
    // Takes the middle so a long label wraps instead of pushing the radio
    // off the row at a large text size.
    flex: 1,
    minWidth: 0,
  },
  labelSelected: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: spacing.md + iconSize.md + spacing.sm,
  },
  note: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xs,
  },
}));
