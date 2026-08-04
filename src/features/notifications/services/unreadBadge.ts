// Pure badge-count formatting — the single place "how does a raw unread
// count become the little pill on a bell icon" is decided, so the header
// bell and the notification screen's own header count can never drift.
const BADGE_CAP = 99;

// null means "render nothing" — a zero badge is a badge nobody asked for
// (Stage 10: "0 ise görünmez").
export function formatUnreadBadge(count: number): string | null {
  const floored = clampUnreadCount(count);
  if (floored === 0) return null;
  if (floored > BADGE_CAP) return `${BADGE_CAP}+`;
  return String(floored);
}

// Floor at 0 — a negative count can never reach the UI, whatever upstream
// bug might otherwise produce one. Also drops any non-finite value (NaN,
// Infinity) to 0 rather than rendering garbage.
export function clampUnreadCount(count: number): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

export function unreadBadgeAccessibilityLabel(count: number): string {
  const floored = clampUnreadCount(count);
  if (floored === 0) return "Okunmamış bildirim yok";
  if (floored === 1) return "1 okunmamış bildirim";
  return `${floored} okunmamış bildirim`;
}
