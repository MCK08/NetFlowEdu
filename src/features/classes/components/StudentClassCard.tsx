import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { ClassRoom } from "@/types/class";

interface StudentClassCardProps {
  classRoom: ClassRoom;
}

export function StudentClassCard({ classRoom }: StudentClassCardProps) {
  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: "/(student)/class/[classId]", params: { classId: classRoom.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${classRoom.name} sınıfını aç`}
    >
      <Text style={styles.name}>{classRoom.name}</Text>
      <Text style={styles.memberCount}>{classRoom.memberCount} üye</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F7F7F8",
    borderRadius: 16,
    padding: 16,
    gap: 4,
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
});
