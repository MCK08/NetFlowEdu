import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { ClassRoom } from "@/types/class";

interface ClassCardProps {
  classRoom: ClassRoom;
}

// expo-clipboard isn't a project dependency — RN's built-in Share sheet
// covers "copy or share the code" in one action (every platform's share
// sheet includes a Copy option) without adding a new package for this MVP.
async function shareCode(name: string, code: string) {
  await Share.share({ message: `${name} sınıfına katılmak için kod: ${code}` });
}

export function ClassCard({ classRoom }: ClassCardProps) {
  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: "/(teacher)/class/[classId]", params: { classId: classRoom.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${classRoom.name} sınıfını aç`}
    >
      <Text style={styles.name}>{classRoom.name}</Text>
      <Text style={styles.memberCount}>{classRoom.memberCount} üye</Text>

      <View style={styles.codeRow}>
        <Text style={styles.codeLabel}>Kod</Text>
        <Text style={styles.code}>{classRoom.joinCode}</Text>
        <Pressable
          onPress={() => shareCode(classRoom.name, classRoom.joinCode)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Kodu paylaş"
        >
          <Ionicons name="share-outline" size={18} color="#3358D9" />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F7F7F8",
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
  },
  memberCount: {
    fontSize: 13,
    color: "#5B5F66",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  codeLabel: {
    fontSize: 13,
    color: "#8A8F98",
  },
  code: {
    fontSize: 15,
    fontWeight: "700",
    color: "black",
    letterSpacing: 2,
    flex: 1,
  },
  iconButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
