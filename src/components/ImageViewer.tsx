import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface ImageViewerProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

// Full-screen image preview for question/answer images. No public URL is
// ever rendered as text — the uri is only ever passed to <Image source>,
// never displayed. No download/share/edit affordance, per requirements —
// this is view-only.
export function ImageViewer({ visible, uri, onClose }: ImageViewerProps) {
  const { width, height } = useWindowDimensions();
  // No new useEffect: resetting to "loading" when `uri` changes is done by
  // comparing against the last-seen uri during render (the standard
  // "adjust state while rendering" pattern) instead of an effect.
  const [imageState, setImageState] = useState<{
    uri: string | null;
    status: "loading" | "loaded" | "error";
  }>({ uri, status: "loading" });
  if (imageState.uri !== uri) {
    setImageState({ uri, status: "loading" });
  }
  // Bumped on retry to force expo-image to re-attempt the same uri (it
  // otherwise treats an unchanged `source` as already resolved/failed).
  const [retryToken, setRetryToken] = useState(0);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  function resetTransform() {
    "worklet";
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= MIN_SCALE) {
        resetTransform();
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (savedScale.value <= MIN_SCALE) return;
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > MIN_SCALE) {
        resetTransform();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    Gesture.Race(doubleTapGesture, panGesture),
    pinchGesture,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  function handleClose() {
    resetTransform();
    onClose();
  }

  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <GestureHandlerRootView style={styles.flex}>
        <AnimatedPressable
          style={styles.closeButton}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
          accessibilityHint="Görsel önizlemesini kapatır"
          hitSlop={8}
        >
          <Ionicons name="close" size={28} color={colors.textInverse} />
        </AnimatedPressable>

        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.imageWrapper, { width, height }, animatedStyle]}>
            <Image
              key={retryToken}
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
              transition={200}
              onLoad={() => setImageState({ uri, status: "loaded" })}
              onError={() => setImageState({ uri, status: "error" })}
            />
          </Animated.View>
        </GestureDetector>

        {imageState.status === "loading" ? (
          <ActivityIndicator
            color={colors.textInverse}
            size="large"
            style={styles.centeredOverlay}
            pointerEvents="none"
          />
        ) : null}

        {imageState.status === "error" ? (
          <AnimatedPressable
            style={styles.centeredOverlay}
            onPress={() => {
              setImageState({ uri, status: "loading" });
              setRetryToken((token) => token + 1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Tekrar dene"
            accessibilityHint="Görseli yeniden yüklemeyi dener"
          >
            <Ionicons name="alert-circle-outline" size={32} color={colors.textInverse} />
            <Text style={styles.errorText}>Görsel yüklenemedi. Tekrar denemek için dokun.</Text>
          </AnimatedPressable>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "black",
  },
  closeButton: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 1,
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  centeredOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.textInverse,
    textAlign: "center",
  },
});
