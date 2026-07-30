import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { KnownAccount } from "@services/firebase/accountRegistry";

interface RecentAccountsListProps {
  accounts: KnownAccount[];
  onContinue: (account: KnownAccount) => Promise<boolean>;
  onUseAnotherAccount: () => void;
}

// Shown above LoginScreen's existing email/password form when this device
// remembers at least one prior session — "Devam Et" reuses the exact same
// switchAccount mechanism as the Account Switcher (see AuthProvider), just
// reached from the login screen instead of a long-press. Does not
// duplicate any sign-in logic itself.
export function RecentAccountsList({ accounts, onContinue, onUseAnotherAccount }: RecentAccountsListProps) {
  const [continuingUid, setContinuingUid] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  if (accounts.length === 0 || collapsed) return null;

  async function handleContinue(account: KnownAccount) {
    setContinuingUid(account.uid);
    try {
      await onContinue(account);
    } finally {
      setContinuingUid(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bu cihazda daha önce giriş yapıldı</Text>

      {accounts.map((account) => (
        <View key={account.uid} style={styles.row}>
          {account.photoURL ? (
            <Image source={{ uri: account.photoURL }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={16} color="#8A8F98" />
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

          <Pressable
            onPress={() => handleContinue(account)}
            disabled={continuingUid !== null}
            style={styles.continueButton}
            accessibilityRole="button"
            accessibilityLabel={`${account.displayName} olarak devam et`}
          >
            {continuingUid === account.uid ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.continueButtonText}>Devam Et</Text>
            )}
          </Pressable>
        </View>
      ))}

      <Pressable
        onPress={() => {
          setCollapsed(true);
          onUseAnotherAccount();
        }}
        style={styles.useAnotherButton}
        accessibilityRole="button"
        accessibilityLabel="Başka hesap kullan"
      >
        <Text style={styles.useAnotherText}>Başka Hesap Kullan</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EDEEF0",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8A8F98",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  username: {
    fontSize: 12,
    color: "#8A8F98",
  },
  continueButton: {
    minHeight: 36,
    minWidth: 88,
    borderRadius: 8,
    backgroundColor: "#3358D9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  continueButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
  useAnotherButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  useAnotherText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3358D9",
  },
});
