import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";

import { QuestionVisibility } from "@/types/question";

interface VisibilityOption {
  value: QuestionVisibility;
  label: string;
  disabled?: boolean;
  disabledHint?: string;
}

const OPTIONS: readonly VisibilityOption[] = [
  { value: "private", label: "Sadece Ben" },
  { value: "public", label: "Herkese Açık" },
  // No real class-membership system exists yet (see firestore.rules) — the
  // option is shown so the schema/UI shape is visible, but disabled rather
  // than faking membership. See ARCHITECTURE.md.
  { value: "class", label: "Sınıf", disabled: true, disabledHint: "Sınıf özelliği yakında" },
];

const FADE_DURATION_MS = 200;

interface VisibilityPickerProps {
  visible: boolean;
  onSelect: (visibility: QuestionVisibility) => void;
  onCancel: () => void;
}

// Deliberately NOT React Native's <Modal>. <Modal> presents a second native
// view controller (iOS) / window (Android) on top of the app — dismissing
// it is an animated, asynchronous native transaction. Calling
// ImagePicker.launchCameraAsync() (which itself presents a native camera
// view controller/activity) before that dismiss transaction has actually
// finished causes the OS to silently drop the camera's presentation
// request — no error, no rejection, the returned promise just never
// settles. This is exactly what device logs showed: everything up to
// "launchCameraAsync started" logged, then nothing.
//
// This component is instead a plain absolutely-positioned RN view layered
// within the same screen (see FeedScreen, the last child in its JSX so it
// stacks on top) — it never presents a second native surface, so there is
// nothing for the camera's presentation to conflict with. Its close
// "animation" is driven by Animated.timing's own completion callback
// (fires exactly when the fade-out finishes — a real signal, not a guessed
// delay) and onSelect/onCancel are only invoked from that callback, after
// the component has already unmounted itself (`setMounted(false)`). By the
// time the parent's capture flow starts, no picker UI exists in any form.
export function VisibilityPicker({ visible, onSelect, onCancel }: VisibilityPickerProps) {
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start();
    }
    // Closing is driven by handleSelect/handleCancel below, not by this
    // effect — visible flips to false only after the parent has already
    // been notified via onSelect/onCancel, at which point this component
    // has already unmounted itself.
  }, [visible, opacity]);

  function fadeOutThen(action: () => void) {
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // `finished` is false if a new animation interrupted this one (e.g.
      // rapid double-tap) — only unmount/act on the transition that
      // actually completed, so a stale interrupted close can't fire twice.
      if (!finished) return;
      setMounted(false);
      action();
    });
  }

  function handleSelect(value: QuestionVisibility) {
    fadeOutThen(() => onSelect(value));
  }

  function handleCancel() {
    fadeOutThen(onCancel);
  }

  if (!mounted) return null;

  return (
    <Animated.View style={[styles.backdrop, { opacity }]}>
      <Pressable style={styles.backdropTouchable} onPress={handleCancel} />
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        <Text style={styles.title}>Soru kimlere görünsün?</Text>

        {OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => !option.disabled && handleSelect(option.value)}
            disabled={option.disabled}
            style={[styles.option, option.disabled ? styles.optionDisabled : null]}
            accessibilityRole="button"
            accessibilityState={{ disabled: option.disabled }}
            accessibilityLabel={option.label}
          >
            <Text style={[styles.optionText, option.disabled ? styles.optionTextDisabled : null]}>
              {option.label}
            </Text>
            {option.disabled && option.disabledHint ? (
              <Text style={styles.hint}>{option.disabledHint}</Text>
            ) : null}
          </Pressable>
        ))}

        <Pressable
          onPress={handleCancel}
          style={styles.cancelButton}
          accessibilityRole="button"
          accessibilityLabel="Vazgeç"
        >
          <Text style={styles.cancelText}>Vazgeç</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
    marginBottom: 8,
    textAlign: "center",
  },
  option: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D0D5DD",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "black",
  },
  optionTextDisabled: {
    color: "#8A8F98",
  },
  hint: {
    fontSize: 12,
    color: "#8A8F98",
    marginTop: 2,
  },
  cancelButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5B5F66",
  },
});
