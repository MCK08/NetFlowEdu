import { Stack } from "expo-router";

export default function StudentLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="question/[questionId]" />
      {/*
        Full-screen card, not a modal sheet: the drawing canvas needs sole
        ownership of vertical pan gestures, and iOS's modal presentation
        installs its own swipe-down-to-dismiss gesture recognizer that
        competes with (and often wins over) the canvas's PanResponder.
        gestureEnabled: false also removes the edge-swipe-back gesture, so
        the only way out is the explicit back button in AnswerScreen, which
        goes through the unsaved-changes confirmation.
      */}
      <Stack.Screen
        name="answer/[questionId]"
        options={{ presentation: "card", gestureEnabled: false, animation: "slide_from_right" }}
      />
      <Stack.Screen name="edit-profile" options={{ presentation: "modal" }} />
    </Stack>
  );
}
