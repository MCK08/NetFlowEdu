import { ComponentProps } from "react";

import { ImageSourcePicker } from "@features/classes/components/ImageSourcePicker";
import { QuestionMetadataModal } from "@features/questions/components/QuestionMetadataModal";

import { ClassTopicComposer } from "../hooks/useClassTopicComposer";

// Phase 101 — the two composer steps, moved out of ClassPerformanceScreen
// unchanged so the "Bugün Öne Çıkanlar" route renders the identical composer.
// Presentational: every piece of state comes from useClassTopicComposer.

type MetadataProps = ComponentProps<typeof QuestionMetadataModal>;

interface ClassTopicComposerModalsProps {
  state: ClassTopicComposer;
  semanticDefinitions: MetadataProps["semanticDefinitions"];
  onCreateSemanticDefinition: MetadataProps["onCreateSemanticDefinition"];
}

export function ClassTopicComposerModals({
  state,
  semanticDefinitions,
  onCreateSemanticDefinition,
}: ClassTopicComposerModalsProps) {
  const { composer, topicContext } = state;
  return (
    <>
      <ImageSourcePicker
        visible={composer.isSourcePickerOpen}
        onSelect={composer.selectImageSource}
        onCancel={composer.cancelSourcePicker}
      />

      <QuestionMetadataModal
        visible={composer.pickedImageUri !== null}
        imageUri={composer.pickedImageUri}
        isUploading={composer.isUploading}
        errorMessage={composer.errorMessage}
        onSubmit={composer.submitDetails}
        onCancel={composer.cancelDetails}
        initialSubject={topicContext?.subject}
        initialTopic={topicContext?.topic}
        // Phase 43 — only ever a grade the topic's own questions agree on;
        // undefined when they do not, so the modal keeps its own default
        // instead of being handed a guess.
        initialGradeLevel={topicContext?.gradeLevel ?? undefined}
        // Phase 80 — the class's shared vocabulary, supplied by the screen.
        semanticDefinitions={semanticDefinitions}
        onCreateSemanticDefinition={onCreateSemanticDefinition}
      />
    </>
  );
}
