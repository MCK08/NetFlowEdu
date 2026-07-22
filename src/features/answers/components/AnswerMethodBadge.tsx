import { StyleSheet, Text, View } from "react-native";

import { getAnswerMethodLabel } from "../services/answerMethodLabel";
import { AnswerMethod } from "../types";

export function AnswerMethodBadge({ method }: { method: AnswerMethod }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{getAnswerMethodLabel(method)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#EEF1FB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3358D9",
  },
});
