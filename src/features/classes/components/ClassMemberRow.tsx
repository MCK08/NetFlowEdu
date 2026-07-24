import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { resolvePublicIdentity } from "@utils/publicIdentity";
import { ClassMember } from "@/types/class";

interface ClassMemberRowProps {
  member: ClassMember;
  canRemove: boolean;
  onRemove: (uid: string) => void;
}

export function ClassMemberRow({ member, canRemove, onRemove }: ClassMemberRowProps) {
  const identity = resolvePublicIdentity(member);

  function confirmRemove() {
    Alert.alert(
      "Üyeyi çıkar",
      `${identity.primaryName} sınıftan çıkarmak istediğinize emin misiniz?`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Çıkar", style: "destructive", onPress: () => onRemove(member.uid) },
      ],
    );
  }

  return (
    <View style={styles.row}>
      {member.photoURL ? (
        <Image source={{ uri: member.photoURL }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={16} color="#8A8F98" />
        </View>
      )}
      <View style={styles.nameColumn}>
        <Text style={styles.name} numberOfLines={1}>
          {identity.primaryName}
        </Text>
        {identity.usernameHandle ? (
          <Text style={styles.handle} numberOfLines={1}>
            {identity.usernameHandle}
          </Text>
        ) : null}
      </View>
      <Text style={styles.role}>{member.role === "teacher" ? "Öğretmen" : "Öğrenci"}</Text>
      {canRemove && member.role !== "teacher" ? (
        <Pressable
          onPress={confirmRemove}
          style={styles.removeButton}
          accessibilityRole="button"
          accessibilityLabel="Üyeyi sınıftan çıkar"
        >
          <Ionicons name="close-circle-outline" size={20} color="#D92D20" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EDEEF0",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  nameColumn: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: "black",
  },
  handle: {
    fontSize: 12,
    color: "#8A8F98",
  },
  role: {
    fontSize: 12,
    color: "#8A8F98",
  },
  removeButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
