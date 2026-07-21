import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert } from "react-native";

import { useAuth } from "@features/authentication";

import { saveProfileEdits } from "../services/profileService";

export function useEditProfileForm() {
  const { firebaseUser, profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [pickedPhotoUri, setPickedPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    try {
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
    previewPhotoUri: pickedPhotoUri ?? profile?.photoURL ?? null,
    pickPhoto,
    isSaving,
    submit,
  };
}
