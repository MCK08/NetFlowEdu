import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";

interface JoinClassModalProps {
  visible: boolean;
  isJoining: boolean;
  errorMessage: string | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}

export function JoinClassModal({
  visible,
  isJoining,
  errorMessage,
  onSubmit,
  onCancel,
}: JoinClassModalProps) {
  const [code, setCode] = useState("");

  function handleSubmit() {
    if (code.trim().length === 0) return;
    onSubmit(code.trim());
  }

  function handleCancel() {
    setCode("");
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Sınıfa katıl</Text>
          <TextInput
            style={styles.input}
            placeholder="Sınıf kodu"
            placeholderTextColor="#8A8F98"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            maxLength={12}
            autoFocus
          />
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <PrimaryButton label="Katıl" onPress={handleSubmit} isLoading={isJoining} />
          <Pressable onPress={handleCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Vazgeç</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
    textAlign: "center",
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: "#D0D5DD",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "black",
    letterSpacing: 2,
    textAlign: "center",
  },
  error: {
    color: "#D92D20",
    fontSize: 13,
    textAlign: "center",
  },
  cancelButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5B5F66",
  },
});
