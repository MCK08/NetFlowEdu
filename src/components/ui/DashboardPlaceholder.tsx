import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "./PrimaryButton";

interface DashboardPlaceholderProps {
  panelTitle: string;
  displayName: string;
  onLogout: () => void;
}

export function DashboardPlaceholder({
  panelTitle,
  displayName,
  onLogout,
}: DashboardPlaceholderProps) {
  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <Text style={styles.title}>NetFlow Edu</Text>
        <Text style={styles.subtitle}>{panelTitle}</Text>
        <Text style={styles.name}>{displayName}</Text>
        <PrimaryButton label="Çıkış Yap" onPress={onLogout} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
});
