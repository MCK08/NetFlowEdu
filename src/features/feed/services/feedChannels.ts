import { UserRole } from "@/types/user";

// Phase 50 — the launch feed's channel model.
//
// Pure, Firebase/React-free and deterministic, exactly like feedFilters.ts
// and feedRanking.ts beside it. This file decides WHICH channels a role
// gets and what each one MEANS; it never fetches, ranks, or renders.
//
// WHY CHANNELS ARE A CLOSED UNION PER ROLE
//
// A channel is not a free-text label — each one is backed by a specific,
// already-existing data source (see the table in PHASE50_LAUNCH_FEED.md).
// Modelling them as a union means a role can never be handed a channel
// whose data it has no permission to read: the student union and the
// teacher union are disjoint by construction, so an account switch cannot
// leave a teacher channel selected on a student feed (Phase 50 §22).

export type StudentFeedChannel = "for_you" | "discover" | "my_classes" | "struggles";

export type TeacherFeedChannel = "discover" | "my_class" | "student_signals" | "my_content";

export type FeedChannel = StudentFeedChannel | TeacherFeedChannel;

export interface FeedChannelDescriptor {
  id: FeedChannel;
  // Fixed Turkish label — never generated, never interpolated.
  label: string;
  // What this channel shows when it has nothing. Short by design (§26):
  // one sentence, no marketing, no fabricated next action.
  emptyTitle: string;
}

// Student channels, in bar order. "for_you" is first because it is the
// launch default (§39) — the student lands on their own prioritized
// content rather than an undifferentiated public list.
const STUDENT_CHANNELS: readonly FeedChannelDescriptor[] = [
  {
    id: "for_you",
    label: "Sana Özel",
    emptyTitle: "Henüz sana özel yeterli içerik yok.",
  },
  {
    id: "discover",
    label: "Keşfet",
    emptyTitle: "Şu anda keşfedilecek yeni soru yok.",
  },
  {
    id: "my_classes",
    label: "Derslerim",
    emptyTitle: "Sınıflarında henüz soru paylaşılmamış.",
  },
  {
    id: "struggles",
    label: "Zorlandıklarım",
    emptyTitle: "Şimdilik tekrar gerektiren bir konu görünmüyor.",
  },
];

// Teacher channels, in bar order. "discover" leads for the same reason the
// teacher feed exists at all (§19): the teacher surface is a DISCOVERY and
// ACTION entry point, not a second dashboard.
const TEACHER_CHANNELS: readonly FeedChannelDescriptor[] = [
  {
    id: "discover",
    label: "Keşfet",
    emptyTitle: "Şu anda keşfedilecek yeni soru yok.",
  },
  {
    id: "my_class",
    label: "Sınıfım",
    emptyTitle: "Bu sınıf için henüz içerik görünmüyor.",
  },
  {
    id: "student_signals",
    label: "Öğrenci Sinyalleri",
    emptyTitle: "Şu anda dikkat gerektiren bir sinyal yok.",
  },
  {
    id: "my_content",
    label: "İçeriklerim",
    emptyTitle: "Henüz soru oluşturmadın.",
  },
];

// The channel list for a role. Any role that is not student/teacher (admin,
// or an unresolved/unknown role during the brief window before the profile
// loads) gets NO channels rather than a guessed set — the caller then
// renders no channel bar at all, which is the honest state, not an empty
// student feed.
export function channelsForRole(role: UserRole | null | undefined): readonly FeedChannelDescriptor[] {
  if (role === "student") return STUDENT_CHANNELS;
  if (role === "teacher") return TEACHER_CHANNELS;
  return [];
}

// The channel a role's feed opens on (§21). Null for a role with no
// channels, for the same "never guess" reason as above.
export function defaultChannelForRole(role: UserRole | null | undefined): FeedChannel | null {
  return channelsForRole(role)[0]?.id ?? null;
}

// Whether `channel` is one this role is actually allowed to be on.
//
// This is the account-switch guard (§22): "discover" is the ONE id both
// unions share, so a teacher→student switch that naively kept the selected
// channel would silently leave a student on a teacher-only channel
// ("my_content") whose data they cannot read. Callers run every restored /
// carried-over channel through this before using it.
export function isChannelAllowedForRole(
  channel: FeedChannel | null | undefined,
  role: UserRole | null | undefined,
): boolean {
  if (!channel) return false;
  return channelsForRole(role).some((descriptor) => descriptor.id === channel);
}

// Narrows an arbitrary (possibly stale, possibly cross-role) channel to one
// this role can actually use, falling back to the role's default. Returns
// null only when the role has no channels at all.
export function resolveChannelForRole(
  channel: FeedChannel | null | undefined,
  role: UserRole | null | undefined,
): FeedChannel | null {
  if (isChannelAllowedForRole(channel, role)) return channel ?? null;
  return defaultChannelForRole(role);
}

export function channelDescriptor(
  channel: FeedChannel,
  role: UserRole | null | undefined,
): FeedChannelDescriptor | null {
  return channelsForRole(role).find((descriptor) => descriptor.id === channel) ?? null;
}

// Phase 54 — the identity of one immersive feed "session".
//
// useInterleavedStudyFeed resets its whole item list (and its session-local
// reshow bookkeeping) whenever this value changes. Both inputs matter and
// neither is sufficient alone:
//
//  · the CHANNEL decides which questions exist at all, so a reshow pair
//    built for "Zorlandıklarım" must never survive into "Keşfet"
//  · the FILTER narrows that same pool, which is the case Phase 21 already
//    documented for the pre-Phase-50 feed
//
// Before Phase 54 only the filter was used, because the pre-Phase-50 feed
// had no channels. Feeding a channel-blind key into the pager would leave a
// stale rating card pointing at a question the new channel no longer
// contains.
export function feedSessionKey(
  channel: FeedChannel | null | undefined,
  filterKey: string,
): string {
  return `${channel ?? ""}|${filterKey}`;
}
