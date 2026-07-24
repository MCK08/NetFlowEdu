import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";

interface CreateClassModalProps {
  visible: boolean;
  isCreating: boolean;
  errorMessage: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

// No camera view is ever shown near this modal, so RN's built-in <Modal>
// is safe here (unlike VisibilityPicker — see its comment on why it avoids
// <Modal> specifically around the camera launch race).
export function CreateClassModal({
  visible,
  isCreating,
  errorMessage,
  onSubmit,
  onCancel,
}: CreateClassModalProps) {
  const [name, setName] = useState("");

  function handleSubmit() {
    if (name.trim().length === 0) return;
    onSubmit(name.trim());
  }

  function handleCancel() {
    setName("");
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Yeni sınıf oluştur</Text>
          <TextInput
            style={styles.input}
            placeholder="Sınıf adı"
            placeholderTextColor="#8A8F98"
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoFocus
          />
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <PrimaryButton label="Oluştur" onPress={handleSubmit} isLoading={isCreating} />
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
