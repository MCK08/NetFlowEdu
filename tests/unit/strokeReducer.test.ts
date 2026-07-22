import {
  clearAll,
  commitStroke,
  createStableId,
  DrawnPath,
  undoLast,
} from "@features/answers/services/strokeReducer";

function pending(d: string, overrides: Partial<{ strokeWidth: number; color: string }> = {}) {
  return { d, strokeWidth: overrides.strokeWidth ?? 3, color: overrides.color ?? "black" };
}

// These test the exact fix for the "stroke disappears on finger release"
// bug: commitStroke takes an already-captured plain value, never a ref, so
// there's no way for it to observe a mutation that happens after the
// caller decided what to commit.
describe("commitStroke", () => {
  it("keeps the stroke after it is committed (finger release)", () => {
    const result = commitStroke([], pending("M10,10 L20,20"));
    expect(result).toHaveLength(1);
    expect(result.at(0)?.d).toBe("M10,10 L20,20");
  });

  it("accumulates multiple strokes in order", () => {
    let paths: DrawnPath[] = [];
    paths = commitStroke(paths, pending("M0,0 L1,1"));
    paths = commitStroke(paths, pending("M2,2 L3,3"));
    paths = commitStroke(paths, pending("M4,4 L5,5"));

    expect(paths.map((p) => p.d)).toEqual(["M0,0 L1,1", "M2,2 L3,3", "M4,4 L5,5"]);
  });

  it("never mutates the input array", () => {
    const original: DrawnPath[] = [{ id: "a", d: "M0,0 L1,1", strokeWidth: 3, color: "black" }];
    const originalCopy = [...original];

    commitStroke(original, pending("M2,2 L3,3"));

    expect(original).toEqual(originalCopy);
  });

  it("returns the exact same array reference when there is nothing to commit", () => {
    // Models a parent re-render / no-op call: strokes must not be reset or
    // reallocated when there's no new stroke to add.
    const paths: DrawnPath[] = [{ id: "a", d: "M0,0 L1,1", strokeWidth: 3, color: "black" }];

    expect(commitStroke(paths, null)).toBe(paths);
    expect(commitStroke(paths, pending(""))).toBe(paths);
    expect(commitStroke(paths, pending("   ")).length).toBe(paths.length);
  });

  it("assigns a stable, unique id to every committed stroke", () => {
    let paths: DrawnPath[] = [];
    paths = commitStroke(paths, pending("M0,0 L1,1"));
    paths = commitStroke(paths, pending("M2,2 L3,3"));

    const ids = paths.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("exports all permanently committed strokes for saving, none dropped", () => {
    let paths: DrawnPath[] = [];
    const strokes = ["M0,0 L1,1", "M2,2 L3,3", "M4,4 L5,5", "M6,6 L7,7"];
    for (const d of strokes) {
      paths = commitStroke(paths, pending(d));
    }

    // Whatever ends up in `paths` at save-time is exactly what the SVG (and
    // therefore the exported PNG) renders — so this array being complete
    // and in order is what "saving exports all permanent strokes" means.
    expect(paths).toHaveLength(strokes.length);
    expect(paths.map((p) => p.d)).toEqual(strokes);
  });
});

describe("undoLast", () => {
  it("removes only the last stroke, keeping earlier ones", () => {
    let paths: DrawnPath[] = [];
    paths = commitStroke(paths, pending("M0,0 L1,1"));
    paths = commitStroke(paths, pending("M2,2 L3,3"));
    paths = commitStroke(paths, pending("M4,4 L5,5"));

    const afterUndo = undoLast(paths);

    expect(afterUndo.map((p) => p.d)).toEqual(["M0,0 L1,1", "M2,2 L3,3"]);
  });

  it("is a no-op on an empty list", () => {
    expect(undoLast([])).toEqual([]);
  });
});

describe("clearAll", () => {
  it("removes every stroke", () => {
    expect(clearAll()).toEqual([]);
  });
});

describe("createStableId", () => {
  it("produces a new, non-empty id on every call", () => {
    const a = createStableId();
    const b = createStableId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});
