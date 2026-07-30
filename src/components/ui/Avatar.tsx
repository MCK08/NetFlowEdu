import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { avatarSize } from "@theme/sizes";
import { colors } from "@theme/colors";

export type AvatarSize = keyof typeof avatarSize;

interface AvatarProps {
  photoURL?: string | null;
  displayName?: string | null;
  size?: AvatarSize;
}

function initialsFrom(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 1).toUpperCase();
}

// Consolidates the photoURL-or-placeholder pattern repeated inline in
// ProfileScreen, AccountSwitcherSheet, and PublicProfileScreen (each
// re-implements the same `<Image> : <Ionicons name="person">` branch at a
// different pixel size). Adds an initials fallback as a small genuine
// improvement over the current bare person-icon placeholder, kept subtle
// enough not to read as a redesign.
export const Avatar = memo(function Avatar({ photoURL, displayName, size = "md" }: AvatarProps) {
  const dimension = avatarSize[size];
  const dimensionStyle = { width: dimension, height: dimension, borderRadius: dimension / 2 };

  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={[styles.image, dimensionStyle]}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }

  const initials = initialsFrom(displayName);

  return (
    <View style={[styles.placeholder, dimensionStyle]}>
      {initials ? (
        <Text style={[styles.initials, { fontSize: dimension * 0.4 }]}>{initials}</Text>
      ) : (
        <Ionicons name="person" size={dimension * 0.42} color={colors.textTertiary} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surfaceMuted,
  },
  placeholder: {
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontWeight: "700",
    color: colors.textSecondary,
  },
});
