import { ROUTES } from "@constants/routes";
import type { UserRole } from "@/types/user";

import { FeedChannel, isChannelAllowedForRole } from "./feedChannels";
import { EMPTY_FEED_FILTER, FeedFilter, FeedQuestionKind } from "./feedFilters";

// Phase 109 — launching the ONE question feed with a filter context.
//
// Çalış's practice launcher, its "Zorlandığın Konular" rows and its
// "Çözemediğim Sorular" section all end in the same place: the Akış tab,
// with the filter and source they chose already applied. The context rides
// on the tab's own route params, and the feed reads it once per launch (the
// nonce below is what lets the same context be launched twice in a row).
// Nothing here creates a second practice surface.

export interface FeedLaunchContext {
  filter: FeedFilter;
  channel: FeedChannel | null;
}

export type FeedLaunchParams = Partial<Record<"subject" | "topic" | "kind" | "grade" | "channel" | "launch", string>>;

const KINDS: readonly FeedQuestionKind[] = ["multiple_choice", "open"];

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** The route params for a launch. Empty fields are omitted, and a fresh
 *  nonce is attached so the feed can tell a new launch from the last one. */
export function buildFeedLaunchParams(context: Partial<FeedLaunchContext>, nonce: number = Date.now()): FeedLaunchParams {
  const params: FeedLaunchParams = { launch: String(nonce) };
  const filter = context.filter ?? EMPTY_FEED_FILTER;
  if (filter.subject) params.subject = filter.subject;
  if (filter.topic) params.topic = filter.topic;
  if (filter.kind) params.kind = filter.kind;
  if (filter.gradeLevel) params.grade = filter.gradeLevel;
  if (context.channel) params.channel = context.channel;
  return params;
}

/** The route the launch navigates to: the student's Akış tab. */
export const FEED_LAUNCH_ROUTE = ROUTES.student;

/** Reads a launch back from route params. Unknown values are dropped, a
 *  channel the role cannot use is dropped, and no launch nonce means no
 *  launch at all (null), so an ordinary tab visit changes nothing. */
export function parseFeedLaunch(
  params: Record<string, string | string[] | undefined>,
  role: UserRole | null | undefined,
): { nonce: string; context: FeedLaunchContext } | null {
  const nonce = first(params.launch);
  if (!nonce) return null;
  const kind = first(params.kind);
  const channel = first(params.channel) as FeedChannel | null;
  return {
    nonce,
    context: {
      filter: {
        subject: first(params.subject),
        topic: first(params.topic),
        gradeLevel: first(params.grade),
        kind: kind && (KINDS as readonly string[]).includes(kind) ? (kind as FeedQuestionKind) : null,
      },
      channel: isChannelAllowedForRole(channel, role) ? channel : null,
    },
  };
}
