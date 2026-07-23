import { useEffect, useRef, useState } from "react";
import { GestureResponderEvent, PanResponder, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { PrimaryButton } from "@components/ui/PrimaryButton";

import { toPngDataUri } from "../services/pngDataUri";
import { clearAll, commitStroke, DrawnPath, PendingStroke, undoLast } from "../services/strokeReducer";

const BRUSH_SIZES = [3, 6, 12] as const;
const CANVAS_HEIGHT = 420;

interface DrawingBoardProps {
  onSave: (dataUri: string) => void;
  isSaving: boolean;
  // Lets the host screen know whether there's a stroke that would be lost
  // on navigation, so it can gate an "unsaved changes" confirmation without
  // this component knowing anything about navigation itself.
  onDirtyChange?: (hasUnsavedContent: boolean) => void;
}

// Minimal drawing system — just enough to verify pen/eraser/undo/clear/save
// round-trip through Storage. Not a note-taking app.
export function DrawingBoard({ onSave, isSaving, onDirtyChange }: DrawingBoardProps) {
  const [paths, setPaths] = useState<DrawnPath[]>([]);

  useEffect(() => {
    onDirtyChange?.(paths.length > 0);
  }, [paths, onDirtyChange]);
  const [liveDraw, setLiveDraw] = useState("");
  const [strokeWidthUI, setStrokeWidthUI] = useState<number>(BRUSH_SIZES[0]);
  const [isErasingUI, setIsErasingUI] = useState(false);

  // PanResponder callbacks are created once (useRef) and would otherwise
  // close over stale state — these refs are read inside those callbacks so
  // every stroke always uses the current brush size / eraser mode.
  const strokeWidthRef = useRef<number>(BRUSH_SIZES[0]);
  const isErasingRef = useRef(false);
  const currentPathRef = useRef("");
  const svgRef = useRef<React.ElementRef<typeof Svg>>(null);

  function selectStrokeWidth(width: number) {
    strokeWidthRef.current = width;
    setStrokeWidthUI(width);
  }

  function toggleEraser() {
    isErasingRef.current = !isErasingRef.current;
    setIsErasingUI(isErasingRef.current);
  }

  // Commits the in-progress stroke into the permanent `paths` array.
  //
  // Root cause this fixes: the previous version read `currentPathRef.current`
  // *inside* the `setPaths` functional updater, then cleared the ref on the
  // very next line. React does not call a functional updater synchronously
  // at the `setState` call site — it's invoked later, during the render
  // that processes the queued update. By the time that happened here, the
  // ref had already been reset to "", so the committed path's `d` was
  // always empty (an empty SVG path draws nothing) — the stroke was visible
  // only via `liveDraw` while moving, then vanished on release.
  //
  // The fix: read the ref into a plain local value (`pending`) FIRST, then
  // clear the ref, then hand that already-captured value to `setPaths`. A
  // plain value captured by closure can't change out from under a deferred
  // updater the way a ref's `.current` can.
  //
  // Shared by both release and terminate so an interrupted gesture (e.g. an
  // incoming call overlay) behaves the same as a normal finger-lift instead
  // of silently discarding the stroke.
  function commitCurrentStroke() {
    const raw = currentPathRef.current;
    // A tap with no movement produces only "M{x},{y}" (no "L" segment) —
    // that draws nothing, so don't let it pollute paths/undo history.
    const pending: PendingStroke | null =
      raw && raw.includes(" L")
        ? {
            d: raw,
            strokeWidth: strokeWidthRef.current,
            color: isErasingRef.current ? "white" : "black",
          }
        : null;

    currentPathRef.current = "";
    setLiveDraw("");

    if (pending) {
      setPaths((prev) => commitStroke(prev, pending));
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Capture-phase variants claim the gesture on the way *down* the tree,
      // before it reaches any ancestor (Stack screen-edge-swipe, a future
      // GestureHandler wrapper, etc). Without these, a fast vertical drag
      // can be interpreted by an ancestor as "swipe to go back" before the
      // canvas ever sees onStartShouldSetPanResponder.
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // Once granted, never let a competing responder (e.g. a system
      // back-gesture recognizer) take the touch stream mid-stroke.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        const { locationX, locationY } = event.nativeEvent;
        currentPathRef.current = `M${locationX},${locationY}`;
        setLiveDraw(currentPathRef.current);
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        const { locationX, locationY } = event.nativeEvent;
        currentPathRef.current += ` L${locationX},${locationY}`;
        setLiveDraw(currentPathRef.current);
      },
      onPanResponderRelease: commitCurrentStroke,
      onPanResponderTerminate: commitCurrentStroke,
    }),
  ).current;

  function undo() {
    setPaths(undoLast);
  }

  function clear() {
    setPaths(clearAll());
    currentPathRef.current = "";
    setLiveDraw("");
  }

  function save() {
    svgRef.current?.toDataURL((base64: string) => {
      const dataUri = toPngDataUri(base64);

      // Kaydet is already disabled while paths.length === 0, but this
      // guards against the SVG renderer itself handing back an empty
      // export — never hand an unusable value to the upload step.
      if (dataUri) onSave(dataUri);
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.canvas} {...panResponder.panHandlers}>
        <Svg ref={svgRef} width="100%" height={CANVAS_HEIGHT} viewBox={`0 0 350 ${CANVAS_HEIGHT}`}>
          {paths.map((path) => (
            <Path
              key={path.id}
              d={path.d}
              stroke={path.color}
              strokeWidth={path.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {liveDraw ? (
            <Path
              d={liveDraw}
              stroke={isErasingUI ? "white" : "black"}
              strokeWidth={strokeWidthUI}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.brushRow}>
          {BRUSH_SIZES.map((size) => (
            <View
              key={size}
              style={[styles.brushDot, strokeWidthUI === size ? styles.brushDotSelected : null]}
              onTouchEnd={() => selectStrokeWidth(size)}
            >
              <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "black" }} />
            </View>
          ))}
        </View>

        <View style={styles.actionsRow}>
          <PrimaryButton
            label={isErasingUI ? "Kalem" : "Silgi"}
            onPress={toggleEraser}
            variant="secondary"
          />
          <PrimaryButton label="Geri Al" onPress={undo} variant="secondary" disabled={paths.length === 0} />
          <PrimaryButton label="Temizle" onPress={clear} variant="secondary" disabled={paths.length === 0} />
        </View>
      </View>

      <PrimaryButton label="Kaydet" onPress={save} isLoading={isSaving} disabled={paths.length === 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  canvas: {
    width: "100%",
    height: CANVAS_HEIGHT,
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    overflow: "hidden",
  },
  toolbar: {
    gap: 12,
  },
  brushRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  brushDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  brushDotSelected: {
    borderColor: "#3358D9",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
});

