import { Ionicons } from "@expo/vector-icons";
import { Alert, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { roleLabel } from "@utils/roleLabels";
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
      <Avatar photoURL={member.photoURL} displayName={identity.primaryName} size="sm" />
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
      <Text style={styles.role}>{roleLabel(member.role)}</Text>
      {canRemove && member.role !== "teacher" ? (
        <AnimatedPressable
          onPress={confirmRemove}
          style={styles.removeButton}
          accessibilityRole="button"
          accessibilityLabel="Üyeyi sınıftan çıkar"
          accessibilityHint={`${identity.primaryName} adlı üyeyi sınıftan çıkarır`}
        >
          <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  nameColumn: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  handle: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  role: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  removeButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
}));
