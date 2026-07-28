import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";

import { CLASS_QUESTION_SUBJECTS } from "../services/subjects";

const MAX_DESCRIPTION_LENGTH = 300;

export interface StudentQuestionDetails {
  subject: string;
  description: string | null;
}

interface StudentQuestionDetailsModalProps {
  visible: boolean;
  imageUri: string | null;
  isUploading: boolean;
  errorMessage: string | null;
  onSubmit: (details: StudentQuestionDetails) => void;
  onCancel: () => void;
}

// Shown ONLY after an image has already been picked (see ImageSourcePicker)
// — no camera/gallery launch ever happens while this is open, so RN's
// built-in <Modal> is safe here, same reasoning as CreateClassModal's own
// doc comment.
export function StudentQuestionDetailsModal({
  visible,
  imageUri,
  isUploading,
  errorMessage,
  onSubmit,
  onCancel,
}: StudentQuestionDetailsModalProps) {
  const [subject, setSubject] = useState<string>(CLASS_QUESTION_SUBJECTS[0]);
  const [description, setDescription] = useState("");

  // Resets the form fields each time a fresh image is picked, not on every
  // re-render — visible flips true→false→true across separate uploads.
  useEffect(() => {
    if (visible) {
      setSubject(CLASS_QUESTION_SUBJECTS[0]);
      setDescription("");
    }
  }, [visible]);

  function handleSubmit() {
    onSubmit({ subject, description: description.trim().length > 0 ? description.trim() : null });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Soru Paylaş</Text>

            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.preview} contentFit="cover" />
            ) : null}

            <Text style={styles.label}>Ders</Text>
            <View style={styles.subjectRow}>
              {CLASS_QUESTION_SUBJECTS.map((option) => {
                const selected = option === subject;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setSubject(option)}
                    style={[styles.subjectChip, selected ? styles.subjectChipSelected : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option}
                  >
                    <Text style={[styles.subjectChipText, selected ? styles.subjectChipTextSelected : null]}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Açıklama (isteğe bağlı)</Text>
            <TextInput
              style={styles.input}
              placeholder="Sorunla ilgili kısa bir not ekle..."
              placeholderTextColor="#8A8F98"
              value={description}
              onChangeText={setDescription}
              maxLength={MAX_DESCRIPTION_LENGTH}
              multiline
            />

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <PrimaryButton label="Paylaş" onPress={handleSubmit} isLoading={isUploading} />
            <Pressable onPress={onCancel} style={styles.cancelButton} disabled={isUploading}>
              <Text style={styles.cancelText}>Vazgeç</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    gap: 12,
    maxHeight: "85%",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
    textAlign: "center",
    marginBottom: 8,
  },
  preview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: "#F2F2F2",
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5B5F66",
    marginBottom: 6,
  },
  subjectRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  subjectChip: {
    borderWidth: 1.5,
    borderColor: "#D0D5DD",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  subjectChipSelected: {
    backgroundColor: "#3358D9",
    borderColor: "#3358D9",
  },
  subjectChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "black",
  },
  subjectChipTextSelected: {
    color: "white",
  },
  input: {
    minHeight: 70,
    borderWidth: 1.5,
    borderColor: "#D0D5DD",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "black",
    marginBottom: 12,
    textAlignVertical: "top",
  },
  error: {
    color: "#D92D20",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
  cancelButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5B5F66",
  },
});
