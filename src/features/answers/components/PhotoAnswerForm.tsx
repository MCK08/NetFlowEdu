import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { iconSize } from "@theme/sizes";
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
        <Image source={{ uri: previewUri }} style={styles.preview} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={iconSize.xl} color={colors.textTertiary} />
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
    gap: spacing.md,
  },
  preview: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  placeholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  placeholderText: {
    color: colors.textTertiary,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
