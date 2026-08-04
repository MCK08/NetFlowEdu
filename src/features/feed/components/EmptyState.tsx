import { colors } from "@theme/colors";

import { EmptyState as SharedEmptyState } from "@components/ui/EmptyState";

interface EmptyStateProps {
  height: number;
}

// Student Home (global feed) empty state — delegates to the shared
// `@components/ui/EmptyState` primitive instead of re-implementing the
// same icon+title+description layout. Kept as its own file/export (same
// name, same `height`-only prop shape) so FeedScreen.tsx needs no change —
// only the internals were a duplicate, not the public shape.
export function EmptyState({ height }: EmptyStateProps) {
  return (
    <SharedEmptyState
      icon="camera-outline"
      title="Henüz soru yüklenmedi"
      description="İlk soruyu sen yükle"
      style={{ width: "100%", height, backgroundColor: colors.background }}
    />
  );
}
