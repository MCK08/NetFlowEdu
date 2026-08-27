import { Ionicons } from "@expo/vector-icons";
import { TextInput, TextInputProps, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { iconSize } from "@theme/sizes";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

interface SearchInputProps extends Omit<TextInputProps, "style"> {
  placeholder?: string;
}

// Genuinely new — no existing search input component was found anywhere
// in the app (find-friends screens use a bare TextField today). Kept
// separate from TextField/PasswordField rather than adding a `variant`
// prop to those, since a search field has no label/error state at all.
export function SearchInput({ placeholder = "Ara", ...inputProps }: SearchInputProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="search" size={iconSize.sm} color={colors.textTertiary} />
      <TextInput
        {...inputProps}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        accessibilityRole="search"
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    height: 44,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
  },
}));
