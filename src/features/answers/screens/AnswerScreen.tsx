import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@features/authentication";

import { DrawingBoard } from "../components/DrawingBoard";
import { PhotoAnswerForm } from "../components/PhotoAnswerForm";
import { useDrawingAnswer } from "../hooks/useDrawingAnswer";

type AnswerMethodChoice = "photo" | "drawing";

interface AnswerScreenProps {
  questionId: string;
}

export function AnswerScreen({ questionId }: AnswerScreenProps) {
  const { firebaseUser } = useAuth();
  const [method, setMethod] = useState<AnswerMethodChoice>("photo");

  function handleSubmitted() {
    router.back();
  }

  const { save, isUploading } = useDrawingAnswer({
    questionId,
    uid: firebaseUser?.uid,
    onSubmitted: handleSubmitted,
  });

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Cevap Ver</Text>
      </View>

      <View style={styles.methodRow}>
        {(
          [
            { value: "photo" as AnswerMethodChoice, label: "Fotoğraf" },
            { value: "drawing" as AnswerMethodChoice, label: "Çizim" },
          ] as const
        ).map((option) => {
          const selected = method === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setMethod(option.value)}
              style={[styles.methodOption, selected ? styles.methodOptionSelected : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.methodText, selected ? styles.methodTextSelected : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.content}>
        {method === "photo" ? (
          <PhotoAnswerForm
            questionId={questionId}
            uid={firebaseUser?.uid}
            onSubmitted={handleSubmitted}
          />
        ) : (
          <DrawingBoard onSave={save} isSaving={isUploading} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "black",
  },
  methodRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  methodOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#8A8F98",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  methodOptionSelected: {
    backgroundColor: "#3358D9",
    borderColor: "#3358D9",
  },
  methodText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  methodTextSelected: {
    color: "white",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
});
