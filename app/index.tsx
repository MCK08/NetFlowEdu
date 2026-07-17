import { ActivityIndicator, StyleSheet, View } from "react-native";

// RouteGuard (see app/_layout.tsx) redirects away from here based on auth
// state as soon as it settles — this screen is only ever visible for a
// single frame at most, so it stays a bare spinner, not a real screen.
export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
