import { StyleSheet, Text, View } from "react-native";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.container} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FEF3F2",
    borderRadius: 8,
    padding: 12,
  },
  text: {
    color: "#D92D20",
    fontSize: 14,
  },
});
