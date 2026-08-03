import { ChatListMessage } from "@/types/message";

import { ChatListItem, groupMessagesWithDateSeparators } from "./chatDateGrouping";

// Two consecutive messages from the same sender are drawn as one visual
// group when they arrive within this window. Five minutes is long enough
// that a normal back-and-forth reads as connected, short enough that a
// reply hours later still gets its own header and timestamp.
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface ChatTimelineSeparator {
  type: "separator";
  id: string;
  label: string;
}

export interface ChatTimelineMessage {
  type: "message";
  id: string;
  message: ChatListMessage;
  // First message of a visual group — the one that carries the sender's
  // name. In ascending (oldest-first) order this is the topmost bubble of
  // the group on screen.
  isFirstInGroup: boolean;
  // Last message of a visual group — the one that carries the avatar, the
  // timestamp and the "tail" corner, matching the iMessage/WhatsApp
  // convention where the avatar sits beside the newest bubble of a run.
  isLastInGroup: boolean;
}

export type ChatTimelineItem = ChatTimelineSeparator | ChatTimelineMessage;

function isGroupableWith(previous: ChatListMessage, current: ChatListMessage): boolean {
  if (previous.senderId !== current.senderId) return false;
  // A pending/failed message never groups with a confirmed one: its
  // timestamp is a local Date.now() guess, so treating it as adjacent to a
  // server-timestamped message would make grouping non-deterministic once
  // the real document arrives and the timestamp shifts.
  if (Boolean(previous.status) !== Boolean(current.status)) return false;
  const delta = current.createdAt - previous.createdAt;
  // Guards a missing/zero timestamp and any out-of-order pair: only a
  // forward gap inside the window groups.
  if (!Number.isFinite(delta) || delta < 0) return false;
  return delta <= GROUP_WINDOW_MS;
}

// Builds the full render timeline: date separators (reusing the existing,
// already-tested groupMessagesWithDateSeparators) plus per-message grouping
// flags.
//
// Input MUST be ascending (oldest first) — the same contract
// groupMessagesWithDateSeparators already documents. The screen reverses
// the result exactly once for its inverted FlatList, so this function never
// needs to know about inversion, and message order is never altered here.
//
// Grouping is deliberately conservative: a separator always breaks a group
// (so a group can never span a date boundary), and the first message after
// any newly-loaded older page simply starts a new group rather than trying
// to guess whether it continues one across a pagination boundary.
export function buildChatTimeline(
  messages: ChatListMessage[],
  now: number = Date.now(),
): ChatTimelineItem[] {
  const withSeparators: ChatListItem[] = groupMessagesWithDateSeparators(messages, now);
  const timeline: ChatTimelineItem[] = [];

  for (let index = 0; index < withSeparators.length; index++) {
    const item = withSeparators[index];
    if (!item) continue;

    if (item.type === "separator") {
      timeline.push(item);
      continue;
    }

    const previous = withSeparators[index - 1];
    const next = withSeparators[index + 1];

    // A neighbour that is a separator (or absent at a list edge) means this
    // bubble is at a group boundary — never assume the neighbour exists.
    const isFirstInGroup =
      previous === undefined ||
      previous.type !== "message" ||
      !isGroupableWith(previous.message, item.message);

    const isLastInGroup =
      next === undefined ||
      next.type !== "message" ||
      !isGroupableWith(item.message, next.message);

    timeline.push({
      type: "message",
      id: item.id,
      message: item.message,
      isFirstInGroup,
      isLastInGroup,
    });
  }

  return timeline;
}

// Cheap structural signature of what the timeline actually depends on.
//
// useClassChat rebuilds its `messages` array on every render (it merges
// live + paginated + optimistic messages inline), so a plain
// `useMemo(..., [messages])` in the screen would recompute on every
// keystroke in the composer and hand FlatList a brand-new data array each
// time. Keying the memo on this signature instead means typing a draft no
// longer rebuilds or re-renders the message list.
export function chatTimelineSignature(messages: ChatListMessage[]): string {
  let signature = "";
  for (const message of messages) {
    signature += `${message.id}:${message.createdAt}:${message.status ?? ""}|`;
  }
  return signature;
}
