import { useRef, useState } from "react";
import { GestureResponderEvent, PanResponder, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { PrimaryButton } from "@components/ui/PrimaryButton";

interface DrawnPath {
  d: string;
  strokeWidth: number;
  color: string;
}

const BRUSH_SIZES = [3, 6, 12] as const;
const CANVAS_HEIGHT = 420;

interface DrawingBoardProps {
  onSave: (dataUri: string) => void;
  isSaving: boolean;
}

// Minimal drawing system — just enough to verify pen/eraser/undo/clear/save
// round-trip through Storage. Not a note-taking app.
export function DrawingBoard({ onSave, isSaving }: DrawingBoardProps) {
  const [paths, setPaths] = useState<DrawnPath[]>([]);
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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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
      onPanResponderRelease: () => {
        if (currentPathRef.current) {
          setPaths((prev) => [
            ...prev,
            {
              d: currentPathRef.current,
              strokeWidth: strokeWidthRef.current,
              color: isErasingRef.current ? "white" : "black",
            },
          ]);
        }
        currentPathRef.current = "";
        setLiveDraw("");
      },
    }),
  ).current;

  function undo() {
    setPaths((prev) => prev.slice(0, -1));
  }

  function clear() {
    setPaths([]);
    currentPathRef.current = "";
    setLiveDraw("");
  }

  function save() {
    svgRef.current?.toDataURL((base64: string) => {
      onSave(`data:image/png;base64,${base64}`);
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.canvas} {...panResponder.panHandlers}>
        <Svg ref={svgRef} width="100%" height={CANVAS_HEIGHT} viewBox={`0 0 350 ${CANVAS_HEIGHT}`}>
          {paths.map((path, index) => (
            <Path
              key={index}
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

