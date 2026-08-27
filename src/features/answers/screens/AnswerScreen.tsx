import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";

import { DrawingBoard } from "../components/DrawingBoard";
import { PhotoAnswerForm } from "../components/PhotoAnswerForm";
import { useDrawingAnswer } from "../hooks/useDrawingAnswer";
import { AnswerExitGuardResult, resolveAnswerExitGuard } from "../services/answerExitGuard";

type AnswerMethodChoice = "photo" | "drawing";

interface AnswerScreenProps {
  questionId: string;
}

export function AnswerScreen({ questionId }: AnswerScreenProps) {
  const { firebaseUser } = useAuth();
  const navigation = useNavigation();
  const [method, setMethod] = useState<AnswerMethodChoice>("photo");
  const [hasUnsavedDrawing, setHasUnsavedDrawing] = useState(false);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);

  // Read inside the beforeRemove listener below, which is registered once
  // and would otherwise close over stale values. An upload in flight (either
  // method) always blocks exit — leaving mid-submit was previously
  // unguarded, which let the submission's own delayed router.back() (see
  // handleSubmitted) fire onto whatever screen the student had since
  // navigated to. Drawing's unsaved-content check is unchanged; it resets to
  // false the moment method !== "drawing", same as before.
  const exitGuardRef = useRef<AnswerExitGuardResult>({ blocked: false, message: "" });

  // Set right before a successful save navigates back, so that same
  // navigation doesn't trip the exit-confirmation prompt it's no longer
  // relevant for (DrawingBoard's local `paths` state is still non-empty at
  // that instant — the upload succeeded, not the local state clearing).
  const suppressExitConfirmRef = useRef(false);

  function handleSubmitted() {
    suppressExitConfirmRef.current = true;
    // The submission that triggered this may resolve well after the student
    // already left this screen by another path (uploads/moderation can take
    // several seconds). Firing router.back() unconditionally here would pop
    // whatever screen the student is CURRENTLY on, not this one — an
    // unexpected, unrelated navigation. Only act while this screen is still
    // the one in focus.
    if (!navigation.isFocused()) return;
    router.back();
  }

  const { save, isUploading } = useDrawingAnswer({
    questionId,
    uid: firebaseUser?.uid,
    onSubmitted: handleSubmitted,
  });

  useEffect(() => {
    exitGuardRef.current = resolveAnswerExitGuard({
      method,
      hasUnsavedDrawing,
      isPhotoUploading,
      isDrawingUploading: isUploading,
    });
  }, [method, hasUnsavedDrawing, isPhotoUploading, isUploading]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (suppressExitConfirmRef.current || !exitGuardRef.current.blocked) return;

      event.preventDefault();
      Alert.alert("Emin misiniz?", exitGuardRef.current.message, [
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
            onUploadingChange={setIsPhotoUploading}
          />
        ) : (
          <DrawingBoard onSave={save} isSaving={isUploading} onDirtyChange={setHasUnsavedDrawing} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
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
}));
