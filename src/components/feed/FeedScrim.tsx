import { memo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

// A soft gradient scrim behind the feed overlays.
//
// Both feed cards previously used a SINGLE flat rgba block, which leaves a
// hard horizontal edge across the question image wherever the block ends —
// the most visible "unfinished" artefact in the old feed. expo-linear-
// gradient is deliberately NOT added (this phase introduces no new
// dependency), so the ramp is built from stacked bands whose alpha follows
// an eased curve. At 10 bands with a gentle exponent the steps fall below
// the perceptual threshold and read as a continuous gradient, while still
// being nothing but plain Views — no blur, no shader, no per-frame cost.
const BAND_COUNT = 10;
const SCRIM_RGB = "11,11,15";

// Precomputed at module scope, never per render: these are the hot paths
// of a paged feed, and a fresh style array per card per render is exactly
// the kind of allocation that shows up while swiping.
function buildBands(maxAlpha: number, strongestFirst: boolean): ViewStyle[] {
  const bands: ViewStyle[] = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    // Position of this band along the ramp, 0 = transparent end.
    const t = strongestFirst ? 1 - i / (BAND_COUNT - 1) : i / (BAND_COUNT - 1);
    // Exponent > 1 keeps the transparent end genuinely subtle instead of
    // ramping up linearly (which still reads as a visible band edge).
    const alpha = maxAlpha * Math.pow(t, 1.6);
    bands.push({ flex: 1, backgroundColor: `rgba(${SCRIM_RGB},${alpha.toFixed(3)})` });
  }
  return bands;
}

const TOP_BANDS = buildBands(0.62, true);
const BOTTOM_BANDS = buildBands(0.88, false);

interface FeedScrimProps {
  placement: "top" | "bottom";
  height: number;
}

export const FeedScrim = memo(function FeedScrim({ placement, height }: FeedScrimProps) {
  const bands = placement === "top" ? TOP_BANDS : BOTTOM_BANDS;
  return (
    <View
      pointerEvents="none"
      style={[styles.container, placement === "top" ? styles.top : styles.bottom, { height }]}
    >
      {bands.map((band, index) => (
        <View key={index} style={band} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
});
