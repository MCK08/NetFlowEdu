import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";

import { DrawingBoard } from "../components/DrawingBoard";
import { PhotoAnswerForm } from "../components/PhotoAnswerForm";
import { useDrawingAnswer } from "../hooks/useDrawingAnswer";

type AnswerMethodChoice = "photo" | "drawing";

interface AnswerScreenProps {
  questionId: string;
}

const UNSAVED_DRAWING_MESSAGE = "Kaydedilmemiş çiziminiz var. Çıkmak istediğinize emin misiniz?";

export function AnswerScreen({ questionId }: AnswerScreenProps) {
  const { firebaseUser } = useAuth();
  const navigation = useNavigation();
  const [method, setMethod] = useState<AnswerMethodChoice>("photo");
  const [hasUnsavedDrawing, setHasUnsavedDrawing] = useState(false);

  // Read inside the beforeRemove listener below, which is registered once
  // and would otherwise close over stale `method`/`hasUnsavedDrawing`
  // values. Also doubles as the "user just switched away from drawing"
  // reset: once method !== "drawing" the effective value is always false,
  // regardless of whatever DrawingBoard last reported before unmounting.
  const shouldConfirmExitRef = useRef(false);
  useEffect(() => {
    shouldConfirmExitRef.current = method === "drawing" && hasUnsavedDrawing;
  }, [method, hasUnsavedDrawing]);

  // Set right before a successful save navigates back, so that same
  // navigation doesn't trip the "unsaved changes" prompt it's no longer
  // relevant for (DrawingBoard's local `paths` state is still non-empty at
  // that instant — the upload succeeded, not the local state clearing).
  const suppressExitConfirmRef = useRef(false);

  function handleSubmitted() {
    suppressExitConfirmRef.current = true;
    router.back();
  }

  const { save, isUploading } = useDrawingAnswer({
    questionId,
    uid: firebaseUser?.uid,
    onSubmitted: handleSubmitted,
  });

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (suppressExitConfirmRef.current || !shouldConfirmExitRef.current) return;

      event.preventDefault();
      Alert.alert("Kaydedilmemiş çizim", UNSAVED_DRAWING_MESSAGE, [
        { text: "İptal", style: "cancel" },
        {
          text: "Çık",
          style: "destructive",
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  const handleBackPress = useCallback(() => {
    router.back();
  }, []);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={handleBackPress}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
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
            <AnimatedPressable
              key={option.value}
              onPress={() => setMethod(option.value)}
              style={[styles.methodOption, selected ? styles.methodOptionSelected : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.methodText, selected ? styles.methodTextSelected : null]}>
                {option.label}
              </Text>
            </AnimatedPressable>
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
          <DrawingBoard onSave={save} isSaving={isUploading} onDirtyChange={setHasUnsavedDrawing} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  methodRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  methodOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  methodOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  methodTextSelected: {
    color: colors.textInverse,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
});
