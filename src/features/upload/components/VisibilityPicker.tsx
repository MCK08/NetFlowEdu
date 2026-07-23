import { Modal, Pressable, StyleSheet, Text } from "react-native";

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

interface VisibilityPickerProps {
  visible: boolean;
  onSelect: (visibility: QuestionVisibility) => void;
  onCancel: () => void;
}

export function VisibilityPicker({ visible, onSelect, onCancel }: VisibilityPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Soru kimlere görünsün?</Text>

          {OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => !option.disabled && onSelect(option.value)}
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
            onPress={onCancel}
            style={styles.cancelButton}
            accessibilityRole="button"
            accessibilityLabel="Vazgeç"
          >
            <Text style={styles.cancelText}>Vazgeç</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
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
