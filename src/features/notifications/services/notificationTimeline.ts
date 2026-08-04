import { NotificationRecord } from "@/types/notification";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type NotificationTimelineSectionKey = "today" | "yesterday" | "older";

export interface NotificationTimelineSection {
  key: NotificationTimelineSectionKey;
  label: string;
  // Named `data`, not `notifications` — this is consumed directly as
  // React Native's SectionList `sections` prop, which requires that exact
  // field name on each section.
  data: NotificationRecord[];
}

const SECTION_LABELS: Record<NotificationTimelineSectionKey, string> = {
  today: "Bugün",
  yesterday: "Dün",
  older: "Daha Önce",
};

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sectionFor(createdAt: number, now: number): NotificationTimelineSectionKey {
  const day = startOfDay(createdAt);
  const today = startOfDay(now);
  if (day === today) return "today";
  if (day === today - ONE_DAY_MS) return "yesterday";
  return "older";
}

// Groups an already-descending (newest-first) notification list into
// Bugün/Dün/Daha Önce sections — same three-bucket convention Stage 8
// asks for, simpler than chatDateGrouping's per-calendar-day separators
// (a notification inbox reads better with a handful of coarse buckets than
// one header per day). Pure, no React/Firebase dependency. Empty sections
// are omitted entirely, never rendered with a "no items" placeholder.
export function groupNotificationsByRecency(
  notifications: NotificationRecord[],
  now: number = Date.now(),
): NotificationTimelineSection[] {
  const buckets: Record<NotificationTimelineSectionKey, NotificationRecord[]> = {
    today: [],
    yesterday: [],
    older: [],
  };

  for (const notification of notifications) {
    buckets[sectionFor(notification.createdAt, now)].push(notification);
  }

  return (["today", "yesterday", "older"] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: SECTION_LABELS[key], data: buckets[key] }));
}
