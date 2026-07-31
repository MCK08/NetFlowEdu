import { Image, ImageContentFit } from "expo-image";
import { memo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@theme/colors";
import { duration } from "@theme/animation";

interface FeedImageProps {
  uri: string;
  // The two feeds deliberately differ here and must keep differing:
  // "contain" for the class feed (a maths question cropped at the edges is
  // unreadable) and "cover" for the public feed's edge-to-edge look. This
  // component never picks for the caller.
  contentFit: ImageContentFit;
  accessibilityLabel: string;
}

// Question image plus a quiet loading state.
//
// Before this, a slow image left a plain black rectangle with no indication
// anything was happening — on a paged feed that reads as a broken card
// rather than a loading one. The spinner sits under the image and is
// covered by it the moment the first frame decodes, and expo-image's own
// fade transition does the rest. No download/caching/Storage behavior is
// touched: this is the same <Image source={{ uri }}> request as before.
export const FeedImage = memo(function FeedImage({
  uri,
  contentFit,
  accessibilityLabel,
}: FeedImageProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingLayer} pointerEvents="none">
          <ActivityIndicator color={colors.textInverse} />
        </View>
      ) : null}

      <Image
        source={{ uri }}
        style={styles.image}
        contentFit={contentFit}
        transition={duration.normal}
        onLoadEnd={() => setIsLoading(false)}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    flex: 1,
  },
});
