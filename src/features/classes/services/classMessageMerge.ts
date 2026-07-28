import { ClassMessage } from "@/types/message";

// Combines the lazily-paginated "older" history with the live-listener's
// "recent window" into one deduplicated, chronologically-sorted list.
// Deduplication matters because the two sources CAN legitimately overlap —
// e.g. the live window's oldest boundary shifts as new messages arrive, so
// a message fetched once as "older" can also briefly appear back in the
// live window. Pure — no Firebase/React dependency, directly unit-testable
// independent of the hook's realtime plumbing.
export function mergeClassMessages(older: ClassMessage[], live: ClassMessage[]): ClassMessage[] {
  const byId = new Map<string, ClassMessage>();
  for (const message of older) byId.set(message.id, message);
  // Live wins on an id collision — it's the freshest read of that document.
  for (const message of live) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
}
