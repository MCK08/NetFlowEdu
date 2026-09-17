import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { IMMERSIVE_FOREGROUND, IMMERSIVE_SURFACE } from "@theme/immersive";
import { themedStyles } from "@theme/themeRuntime";

interface CameraButtonProps {
  onPress: () => void;
  isLoading: boolean;
}

export function CameraButton({ onPress, isLoading }: CameraButtonProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isLoading}
      style={[styles.button, isLoading ? styles.disabled : null]}
      accessibilityRole="button"
      accessibilityLabel="Fotoğraf çek"
      accessibilityHint="Yeni bir soru fotoğrafı çeker"
    >
      {isLoading ? (
        <ActivityIndicator color={IMMERSIVE_SURFACE} />
      ) : (
        // Phase 104 (H3) — decorative; the button says "Fotoğraf çek".
        <Ionicons name="camera" size={30} color={IMMERSIVE_SURFACE} accessibilityElementsHidden />
      )}
    </AnimatedPressable>
  );
}

// Phase 104 (B5) — the shutter sits on the immersive pager, which is dark in
// BOTH themes (Phase 55/102). Its fill and ring used to follow the app theme
// (colors.background / colors.textPrimary), so the same control on the same
// dark surface was a white disc with a dark ring in Light and a dark disc
// with a white ring in Dark — the one Wave-A debt left on this surface. It is
// now pinned to the surface's own vocabulary: the immersive foreground for
// the disc, the immersive surface for the glyph and the ring, exactly the
// pairing the pager's overlay text and rail already use. The white shutter
// keeps the camera affordance legible over a photo and over the empty pager
// alike, and the 68pt geometry is unchanged.
const styles = themedStyles(() => ({
  button: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: IMMERSIVE_FOREGROUND,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: IMMERSIVE_SURFACE,
    // PLATFORM VALUE, deliberately not a token: a shadow is cast light, not
    // painted colour, so it is black in every theme. This used to be
    // colors.textPrimary, which is near-WHITE in dark mode and turned the
    // button's shadow into a glowing halo (caught on the iOS simulator).
    // Against the dark pager a black shadow simply reads as no shadow, and
    // the button's own 3pt ring carries the separation instead.
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  disabled: {
    opacity: 0.6,
  },
}));
