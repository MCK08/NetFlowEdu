import { StyleSheet, Text, View } from "react-native";

interface EmptyStateProps {
  height: number;
}

export function EmptyState({ height }: EmptyStateProps) {
  return (
    <View style={[styles.container, { height }]}>
      <Text style={styles.emoji}>📷</Text>
      <Text style={styles.title}>Henüz soru yüklenmedi</Text>
      <Text style={styles.subtitle}>İlk soruyu sen yükle</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    gap: 8,
  },
  emoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "black",
  },
  subtitle: {
    fontSize: 14,
    color: "#5B5F66",
  },
});
