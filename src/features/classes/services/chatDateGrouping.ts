import { ChatListMessage } from "@/types/message";

export type ChatListItem =
  | { type: "separator"; id: string; label: string }
  | { type: "message"; id: string; message: ChatListMessage };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// "Bugün" / "Dün" / an absolute date, in that order — matches the
// WhatsApp-style date-separator convention this feature is modeled on.
export function formatDateSeparatorLabel(createdAt: number, now: number = Date.now()): string {
  const day = startOfDay(createdAt);
  const today = startOfDay(now);
  if (day === today) return "Bugün";
  if (day === today - ONE_DAY_MS) return "Dün";
  return new Date(createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Input MUST be ascending (oldest first) — a separator is inserted
// immediately before the first message of each new calendar day. Pure/no
// Firebase or React dependency, so this is directly unit-testable
// independent of FlatList rendering order (the screen reverses the result
// once, for the inverted list it actually renders).
export function groupMessagesWithDateSeparators(
  messages: ChatListMessage[],
  now: number = Date.now(),
): ChatListItem[] {
  const items: ChatListItem[] = [];
  let lastDay: number | null = null;

  for (const message of messages) {
    const day = startOfDay(message.createdAt);
    if (day !== lastDay) {
      items.push({ type: "separator", id: `sep-${day}`, label: formatDateSeparatorLabel(message.createdAt, now) });
      lastDay = day;
    }
    items.push({ type: "message", id: message.id, message });
  }

  return items;
}
