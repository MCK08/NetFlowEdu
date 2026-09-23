import { memo } from "react";
import { Share } from "react-native";

import { IconButton } from "@components/ui/IconButton";
import { colors } from "@theme/colors";

import { classShareMessage, shareClassCodeLabel } from "../services/classShare";

interface ShareCodeButtonProps {
  className: string;
  joinCode: string;
}

// Phase 123 — ONE way to hand out a class's join code.
//
// expo-clipboard isn't a project dependency — RN's built-in Share sheet
// covers "copy or share the code" in one action (every platform's share sheet
// includes a Copy option) without adding a package. This lived inside
// ClassCard; the teacher's class detail needs exactly the same control, and
// two copies would drift the day either is reworded or resized.
export const ShareCodeButton = memo(function ShareCodeButton({ className, joinCode }: ShareCodeButtonProps) {
  return (
    <IconButton
      icon="share-outline"
      size="sm"
      color={colors.primary}
      onPress={() => Share.share({ message: classShareMessage(className, joinCode) })}
      accessibilityLabel={shareClassCodeLabel(className)}
    />
  );
});
