import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@features/authentication";
import { PublicProfileScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { colors } from "@theme/colors";

// Mirrors (student)/user/[userId].tsx exactly — same shared
// PublicProfileScreen, own-profile redirect to the teacher's own Profil tab
// instead of the student one.
export default function TeacherPublicProfile() {
  useThemeSubscription();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { firebaseUser } = useAuth();

  const isOwnProfile = Boolean(userId) && userId === firebaseUser?.uid;

  useEffect(() => {
    if (isOwnProfile) {
      router.replace("/(teacher)/(tabs)/profile");
    }
  }, [isOwnProfile]);

  if (!userId || isOwnProfile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  return <PublicProfileScreen userId={userId} />;
}
