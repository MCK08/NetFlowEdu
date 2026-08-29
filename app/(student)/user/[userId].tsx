import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@features/authentication";
import { PublicProfileScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { colors } from "@theme/colors";

export default function PublicProfile() {
  useThemeSubscription();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { firebaseUser } = useAuth();

  const isOwnProfile = Boolean(userId) && userId === firebaseUser?.uid;

  // The current user's own avatar/name opens their existing Profile tab
  // instead of this read-only public view — that tab already has the
  // edit/logout actions this screen deliberately doesn't.
  useEffect(() => {
    if (isOwnProfile) {
      router.replace("/(student)/(tabs)/profile");
    }
  }, [isOwnProfile]);

  // Never navigate to an invalid/empty userId — this also covers the one
  // render tick before the redirect effect above fires for the "own
  // profile" case.
  if (!userId || isOwnProfile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  return <PublicProfileScreen userId={userId} />;
}
