import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@features/authentication";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { useCachedPublicProfile } from "../hooks/useCachedPublicProfile";

const ROLE_LABELS: Record<string, string> = {
  student: "Öğrenci",
  teacher: "Öğretmen",
};

export type FriendRowVariant = "friend" | "incoming" | "outgoing";

interface FriendRowProps {
  uid: string;
  variant: FriendRowVariant;
  isBusy: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}

// One row shared by all three FriendsScreen sections — only the trailing
// action(s) differ by `variant`. Tapping the identity area always opens the
// shared PublicProfileScreen (spec: "Public profile'a gitme").
export function FriendRow({ uid, variant, isBusy, onAccept, onDecline, onCancel }: FriendRowProps) {
  const profile = useCachedPublicProfile(uid);
  const identity = resolvePublicIdentity(profile);
  const { profile: ownProfile } = useAuth();
  // Route groups aren't stripped for programmatic navigation — the same
  // leaf screen exists once per group ((student)/user/[userId] and
  // (teacher)/user/[userId], both reusing PublicProfileScreen), so the
  // fully-qualified, group-included path must be picked explicitly, same
  // pattern as ROUTES.editProfile/ROUTES.student.
  const publicProfilePathname =
    ownProfile?.role === "teacher" ? "/(teacher)/user/[userId]" : "/(student)/user/[userId]";

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.identity}
        onPress={() =>
          router.push({ pathname: publicProfilePathname, params: { userId: uid } })
        }
        accessibilityRole="button"
      >
        {profile?.photoURL ? (
          <Image source={{ uri: profile.photoURL }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={20} color="#8A8F98" />
          </View>
        )}
        <View style={styles.textColumn}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {identity.primaryName}
            </Text>
            {profile?.role ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{ROLE_LABELS[profile.role] ?? profile.role}</Text>
              </View>
            ) : null}
          </View>
          {identity.usernameHandle ? (
            <Text style={styles.handle} numberOfLines={1}>
              {identity.usernameHandle}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {isBusy ? (
        <ActivityIndicator color="black" style={styles.busyIndicator} />
      ) : (
        <View style={styles.actions}>
          {variant === "incoming" ? (
            <>
              <Pressable
                onPress={onAccept}
                style={[styles.actionButton, styles.acceptButton]}
                accessibilityRole="button"
                accessibilityLabel="Kabul Et"
              >
                <Text style={styles.acceptButtonText}>Kabul Et</Text>
              </Pressable>
              <Pressable
                onPress={onDecline}
                style={[styles.actionButton, styles.declineButton]}
                accessibilityRole="button"
                accessibilityLabel="Reddet"
              >
                <Text style={styles.declineButtonText}>Reddet</Text>
              </Pressable>
            </>
          ) : null}
          {variant === "outgoing" ? (
            <Pressable
              onPress={onCancel}
              style={[styles.actionButton, styles.declineButton]}
              accessibilityRole="button"
              accessibilityLabel="İptal Et"
            >
              <Text style={styles.declineButtonText}>İptal Et</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F2F2F2",
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "black",
    flexShrink: 1,
  },
  handle: {
    fontSize: 13,
    color: "#8A8F98",
  },
  badge: {
    backgroundColor: "#F2F2F2",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5B5F66",
  },
  busyIndicator: {
    marginRight: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    backgroundColor: "#3358D9",
  },
  acceptButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
  declineButton: {
    backgroundColor: "#F2F2F2",
  },
  declineButtonText: {
    color: "#5B5F66",
    fontSize: 13,
    fontWeight: "600",
  },
});
