export interface DrawnPath {
  id: string;
  d: string;
  strokeWidth: number;
  color: string;
}

export interface PendingStroke {
  d: string;
  strokeWidth: number;
  color: string;
}

let idCounter = 0;

// Monotonic counter + random suffix: only needs to stay unique for the
// lifetime of one drawing session (used as the SVG <Path> `key`), but the
// random suffix keeps ids distinct across separate DrawingBoard mounts
// within the same test run / module instance too.
export function createStableId(): string {
  idCounter += 1;
  return `path-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

// Pure, immutable append. Never mutates `paths`. Returns the exact same
// array reference when there's nothing to commit, so a caller invoking
// this with `pending: null` (e.g. a release with no movement) can never
// appear to "reset" the list — same reference in, same reference out.
export function commitStroke(paths: DrawnPath[], pending: PendingStroke | null): DrawnPath[] {
  if (!pending || pending.d.trim().length === 0) return paths;
  return [...paths, { ...pending, id: createStableId() }];
}

export function undoLast(paths: DrawnPath[]): DrawnPath[] {
  if (paths.length === 0) return paths;
  return paths.slice(0, -1);
}

export function clearAll(): DrawnPath[] {
  return [];
}
