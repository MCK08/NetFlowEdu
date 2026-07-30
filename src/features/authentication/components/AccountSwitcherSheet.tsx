import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { KnownAccount } from "@services/firebase/accountRegistry";

import { ROUTES } from "@constants/routes";
import { useAuth } from "../hooks/useAuth";

const ROLE_LABELS: Record<string, string> = {
  student: "Öğrenci",
  teacher: "Öğretmen",
  organization_admin: "Kurum Yöneticisi",
  platform_admin: "Platform Yöneticisi",
};

// Same Modal-based sheet pattern already used by CreateClassModal — no new
// bottom-sheet library, this is the one existing pattern extended.
export default function AccountSwitcherSheet() {
  const {
    isAccountSwitcherOpen,
    closeAccountSwitcher,
    knownAccounts,
    firebaseUser,
    switchAccount,
    removeAccount,
  } = useAuth();
  const [switchingUid, setSwitchingUid] = useState<string | null>(null);

  async function handleSwitch(account: KnownAccount) {
    if (account.uid === firebaseUser?.uid) {
      closeAccountSwitcher();
      return;
    }
    setSwitchingUid(account.uid);
    try {
      const success = await switchAccount(account.uid);
      closeAccountSwitcher();
      if (!success) {
        Alert.alert(
          "Oturum sona ermiş",
          `${account.displayName} hesabının oturumu sona ermiş. Lütfen tekrar giriş yapın.`,
        );
        router.replace(ROUTES.login);
      }
    } finally {
      setSwitchingUid(null);
    }
  }

  function confirmRemove(account: KnownAccount) {
    Alert.alert(
      "Hesabı kaldır",
      `${account.displayName} hesabını bu cihazdan kaldırmak istediğinize emin misiniz?`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Kaldır", style: "destructive", onPress: () => removeAccount(account.uid) },
      ],
    );
  }

  function handleAddAccount() {
    closeAccountSwitcher();
    router.push(ROUTES.login);
  }

  return (
    <Modal
      visible={isAccountSwitcherOpen}
      transparent
      animationType="slide"
      onRequestClose={closeAccountSwitcher}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouchable} onPress={closeAccountSwitcher} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Hesaplar</Text>

          {knownAccounts.map((account) => {
            const isActive = account.uid === firebaseUser?.uid;
            const isSwitching = switchingUid === account.uid;
            return (
              <Pressable
                key={account.uid}
                onPress={() => handleSwitch(account)}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`${account.displayName} hesabına geç`}
              >
                {account.photoURL ? (
                  <Image source={{ uri: account.photoURL }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={18} color="#8A8F98" />
                  </View>
                )}

                <View style={styles.nameColumn}>
                  <Text style={styles.name} numberOfLines={1}>
                    {account.displayName || "Kullanıcı"}
                  </Text>
                  {account.username ? (
                    <Text style={styles.username} numberOfLines={1}>
                      @{account.username}
                    </Text>
                  ) : null}
                </View>

                {account.role ? (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{ROLE_LABELS[account.role] ?? account.role}</Text>
                  </View>
                ) : null}

                {isSwitching ? (
                  <ActivityIndicator color="black" style={styles.trailingIcon} />
                ) : isActive ? (
                  <Ionicons name="checkmark-circle" size={22} color="#3358D9" style={styles.trailingIcon} />
                ) : (
                  <Pressable
                    onPress={() => confirmRemove(account)}
                    style={styles.removeButton}
                    accessibilityRole="button"
                    accessibilityLabel={`${account.displayName} hesabını kaldır`}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#8A8F98" />
                  </Pressable>
                )}
              </Pressable>
            );
          })}

          <Pressable
            onPress={handleAddAccount}
            style={styles.addButton}
            accessibilityRole="button"
            accessibilityLabel="Başka hesap ekle"
          >
            <Ionicons name="add-circle-outline" size={20} color="#3358D9" />
            <Text style={styles.addButtonText}>Başka Hesap Ekle</Text>
          </Pressable>

          <Pressable onPress={closeAccountSwitcher} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Kapat</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
    marginBottom: 8,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EDEEF0",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  nameColumn: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "black",
  },
  username: {
    fontSize: 12,
    color: "#8A8F98",
  },
  roleBadge: {
    backgroundColor: "#F2F2F2",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5B5F66",
  },
  trailingIcon: {
    marginLeft: 8,
  },
  removeButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    marginTop: 12,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#3358D9",
  },
  cancelButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5B5F66",
  },
});
