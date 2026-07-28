import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";

import { QuestionImageSource } from "@features/upload/services/uploadService";

interface ImageSourcePickerProps {
  visible: boolean;
  onSelect: (source: QuestionImageSource) => void;
  onCancel: () => void;
}

// Same non-<Modal> fade-overlay architecture as VisibilityPicker, for the
// exact same reason: this picker's whole job is to lead into
// launchCameraAsync/launchImageLibraryAsync, and RN's <Modal> presents a
// second native surface whose dismiss-animation race with a camera/gallery
// launch silently drops the presentation request (reproduced on-device,
// see VisibilityPicker's doc comment). onSelect/onCancel only fire after
// this component has already unmounted itself, so no picker UI of any kind
// exists by the time the native image picker launches.
export function ImageSourcePicker({ visible, onSelect, onCancel }: ImageSourcePickerProps) {
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, opacity]);

  function fadeOutThen(action: () => void) {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
      ({ finished }) => {
        if (!finished) return;
        setMounted(false);
        action();
      },
    );
  }

  function handleSelect(source: QuestionImageSource) {
    fadeOutThen(() => onSelect(source));
  }

  function handleCancel() {
    fadeOutThen(onCancel);
  }

  if (!mounted) return null;

  return (
    <Animated.View style={[styles.backdrop, { opacity }]}>
      <Pressable style={styles.backdropTouchable} onPress={handleCancel} />
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        <Text style={styles.title}>Soru fotoğrafı ekle</Text>

        <Pressable
          onPress={() => handleSelect("camera")}
          style={styles.option}
          accessibilityRole="button"
          accessibilityLabel="Kamera ile çek"
        >
          <Text style={styles.optionText}>Kamera ile Çek</Text>
        </Pressable>

        <Pressable
          onPress={() => handleSelect("gallery")}
          style={styles.option}
          accessibilityRole="button"
          accessibilityLabel="Galeriden seç"
        >
          <Text style={styles.optionText}>Galeriden Seç</Text>
        </Pressable>

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
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "black",
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
