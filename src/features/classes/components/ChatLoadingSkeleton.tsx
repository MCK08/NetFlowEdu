import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";

// Alternating incoming/outgoing placeholders with varied widths, so the
// initial load reads as "a conversation is arriving" rather than the bare
// centred spinner it replaces. Deliberately only six rows: each one runs
// its own shimmer animation, and a screenful of them is animation for its
// own sake.
const ROWS: { own: boolean; width: number }[] = [
  { own: false, width: 168 },
  { own: false, width: 116 },
  { own: true, width: 140 },
  { own: false, width: 196 },
  { own: true, width: 96 },
  { own: true, width: 152 },
];

export const ChatLoadingSkeleton = memo(function ChatLoadingSkeleton() {
  return (
    <View style={styles.container} accessible accessibilityLabel="Mesajlar yükleniyor">
      {ROWS.map((row, index) => (
        <View key={index} style={[styles.row, row.own ? styles.rowOwn : null]}>
          {!row.own ? <LoadingSkeleton width={32} height={32} borderRadius={16} /> : null}
          <LoadingSkeleton width={row.width} height={40} borderRadius={radius.xl} />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  rowOwn: {
    justifyContent: "flex-end",
  },
});
