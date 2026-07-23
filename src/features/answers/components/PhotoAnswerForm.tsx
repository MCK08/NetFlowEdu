import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { QuestionVisibility } from "@/types/question";

import { usePhotoAnswer } from "../hooks/usePhotoAnswer";

interface PhotoAnswerFormProps {
  questionId: string;
  uid: string | undefined;
  questionVisibility: QuestionVisibility;
  onSubmitted: () => void;
}

export function PhotoAnswerForm({
  questionId,
  uid,
  questionVisibility,
  onSubmitted,
}: PhotoAnswerFormProps) {
  const { previewUri, isUploading, pickFromCamera, pickFromGallery, submit } = usePhotoAnswer({
    questionId,
    uid,
    questionVisibility,
    onSubmitted,
  });

  return (
    <View style={styles.container}>
      {previewUri ? (
        <Image source={{ uri: previewUri }} style={styles.preview} contentFit="cover" />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Fotoğraf seçilmedi</Text>
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.flex}>
          <PrimaryButton label="Kamera" onPress={pickFromCamera} variant="secondary" />
        </View>
        <View style={styles.flex}>
          <PrimaryButton label="Galeri" onPress={pickFromGallery} variant="secondary" />
        </View>
      </View>

      <PrimaryButton
        label="Yükle"
        onPress={submit}
        isLoading={isUploading}
        disabled={!previewUri}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  preview: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: "#F2F2F2",
  },
  placeholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#8A8F98",
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  flex: {
    flex: 1,
  },
});
