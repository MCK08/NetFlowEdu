import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from "react-native";

import { useFriendshipAction } from "../hooks/useFriendshipAction";

interface FriendshipButtonProps {
  ownUid: string | undefined;
  otherUid: string;
}

// The single status button PublicProfileScreen shows for another
// student/teacher's profile (spec section 10). Never rendered for the
// caller's own profile — PublicProfileScreen/user/[userId] already redirect
// away from that case before this ever mounts.
export function FriendshipButton({ ownUid, otherUid }: FriendshipButtonProps) {
  const {
    state,
    isLoading,
    isMutating,
    errorMessage,
    sendRequest,
    cancelRequest,
    acceptRequest,
    declineRequest,
    unfriend,
  } = useFriendshipAction(ownUid, otherUid);
  const [showAcceptDecline, setShowAcceptDecline] = useState(false);

  if (isLoading) {
    return <ActivityIndicator color="black" style={styles.loading} />;
  }

  function confirmUnfriend() {
    Alert.alert("Arkadaşlıktan çık", "Bu kişiyi arkadaş listenden çıkarmak istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Çıkar", style: "destructive", onPress: unfriend },
    ]);
  }

  if (isMutating) {
    return <ActivityIndicator color="black" style={styles.loading} />;
  }

  if (state === "none") {
    return (
      <>
        <Pressable
          onPress={sendRequest}
          style={[styles.button, styles.primary]}
          accessibilityRole="button"
          accessibilityLabel="Arkadaş Ekle"
        >
          <Text style={styles.primaryText}>Arkadaş Ekle</Text>
        </Pressable>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </>
    );
  }

  if (state === "requested_by_me") {
    return (
      <>
        <Pressable
          onPress={cancelRequest}
          style={[styles.button, styles.secondary]}
          accessibilityRole="button"
          accessibilityLabel="İstek Gönderildi, iptal etmek için dokun"
        >
          <Text style={styles.secondaryText}>İstek Gönderildi</Text>
        </Pressable>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </>
    );
  }

  if (state === "requested_by_them") {
    if (!showAcceptDecline) {
      return (
        <Pressable
          onPress={() => setShowAcceptDecline(true)}
          style={[styles.button, styles.primary]}
          accessibilityRole="button"
          accessibilityLabel="İsteği Kabul Et"
        >
          <Text style={styles.primaryText}>İsteği Kabul Et</Text>
        </Pressable>
      );
    }
    return (
      <>
        <Pressable
          onPress={acceptRequest}
          style={[styles.button, styles.primary]}
          accessibilityRole="button"
          accessibilityLabel="Kabul Et"
        >
          <Text style={styles.primaryText}>Kabul Et</Text>
        </Pressable>
        <Pressable
          onPress={declineRequest}
          style={[styles.button, styles.secondary]}
          accessibilityRole="button"
          accessibilityLabel="Reddet"
        >
          <Text style={styles.secondaryText}>Reddet</Text>
        </Pressable>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </>
    );
  }

  // state === "friends"
  return (
    <>
      <Pressable
        onPress={confirmUnfriend}
        style={[styles.button, styles.secondary]}
        accessibilityRole="button"
        accessibilityLabel="Arkadaşsınız"
      >
        <Text style={styles.secondaryText}>Arkadaşsınız</Text>
      </Pressable>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginVertical: 8,
  },
  button: {
    minHeight: 40,
    minWidth: 160,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  primary: {
    backgroundColor: "#3358D9",
  },
  primaryText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  secondary: {
    backgroundColor: "#F2F2F2",
  },
  secondaryText: {
    color: "#5B5F66",
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    color: "#D92D20",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
});
