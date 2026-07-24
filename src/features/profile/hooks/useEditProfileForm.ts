import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert } from "react-native";

import { useAuth } from "@features/authentication";
import { setUsername } from "@services/firebase/functions";
import { mapAuthErrorToMessage } from "@features/authentication/services/errorMapper";

import { saveProfileEdits } from "../services/profileService";

export function useEditProfileForm() {
  const { firebaseUser, profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  // Username can only ever be CLAIMED once (see functions/src/users/setUsername.ts
  // — it rejects a caller who already has one set) — the existing secure
  // reservation system doesn't support changing an already-set username, so
  // this field is only editable for an account that doesn't have one yet.
  // preserves whatever's already there, read-only, if it does.
  const hasExistingUsername = Boolean(profile?.username);
  const [username, setUsername_] = useState(profile?.username ?? "");
  const [pickedPhotoUri, setPickedPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Galeri izni gerekli",
        "Profil fotoğrafı seçebilmek için galeri erişimine izin vermelisiniz.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setPickedPhotoUri(result.assets[0].uri);
    }
  }

  async function submit() {
    if (!firebaseUser || isSaving) return;
    setIsSaving(true);
    setUsernameError(null);
    try {
      // Claim the username first (through the existing secure reservation
      // callable) — if it's taken, the whole save stops here with a clear,
      // recoverable field error, before touching displayName/photoURL, so
      // the user can just change the username and try again.
      if (!hasExistingUsername && username.trim().length > 0) {
        try {
          await setUsername(username.trim());
        } catch (error) {
          setUsernameError(mapAuthErrorToMessage(error));
          setIsSaving(false);
          return;
        }
      }

      await saveProfileEdits({
        uid: firebaseUser.uid,
        displayName,
        newPhotoLocalUri: pickedPhotoUri,
      });
      router.back();
    } catch {
      Alert.alert("Kaydedilemedi", "Profil güncellenirken bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsSaving(false);
    }
  }

  return {
    displayName,
    setDisplayName,
    username,
    setUsername: setUsername_,
    hasExistingUsername,
    usernameError,
    previewPhotoUri: pickedPhotoUri ?? profile?.photoURL ?? null,
    pickPhoto,
    isSaving,
    submit,
  };
}
