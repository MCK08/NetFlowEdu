import { StyleSheet, Text, View } from "react-native";

interface ChatDateSeparatorProps {
  label: string;
}

export function ChatDateSeparator({ label }: ChatDateSeparatorProps) {
  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    paddingVertical: 8,
  },
  pill: {
    backgroundColor: "#F2F2F2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5B5F66",
  },
});
