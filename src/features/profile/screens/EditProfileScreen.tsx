import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { KeyboardSafeScreen } from "@components/ui/KeyboardSafeScreen";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";

import { useEditProfileForm } from "../hooks/useEditProfileForm";

export function EditProfileScreen() {
  const {
    displayName,
    setDisplayName,
    username,
    setUsername,
    hasExistingUsername,
    usernameError,
    previewPhotoUri,
    pickPhoto,
    isSaving,
    submit,
  } = useEditProfileForm();

  return (
    <KeyboardSafeScreen>
      <Text style={styles.title}>Profili Düzenle</Text>

      <Pressable onPress={pickPhoto} style={styles.avatarWrapper} accessibilityRole="button">
        {previewPhotoUri ? (
          <Image source={{ uri: previewPhotoUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={40} color="#8A8F98" />
          </View>
        )}
        <Text style={styles.changePhotoText}>Fotoğrafı Değiştir</Text>
      </Pressable>

      <TextField
        label="Görünen Ad"
        value={displayName}
        onChangeText={setDisplayName}
        autoComplete="name"
        textContentType="name"
      />

      <TextField
        label="Kullanıcı Adı"
        value={username}
        onChangeText={setUsername}
        errorMessage={usernameError ?? undefined}
        editable={!hasExistingUsername}
        autoCapitalize="none"
        autoComplete="username"
      />
      {hasExistingUsername ? (
        <Text style={styles.usernameLockedHint}>Kullanıcı adı sonradan değiştirilemiyor.</Text>
      ) : null}

      <PrimaryButton label="Kaydet" onPress={submit} isLoading={isSaving} />
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  avatarWrapper: {
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F2F2F2",
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3358D9",
  },
  usernameLockedHint: {
    fontSize: 12,
    color: "#8A8F98",
    marginTop: -8,
  },
});
