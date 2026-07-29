// Spec: 0 -> no badge, 1-99 -> exact number, 100+ -> "99+". Returns null
// exactly when no badge should render, so callers can do
// `{badge ? <Badge>{badge}</Badge> : null}` directly.
export function formatRequestBadge(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}
