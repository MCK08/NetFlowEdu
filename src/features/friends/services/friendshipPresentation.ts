import { FriendshipButtonState } from "./friendshipState";

// Every social action the existing friendship system actually supports.
// There is deliberately no "block", "mute", "follow" or "message" here:
// none of those exist in this project, and a presentation layer must not
// imply capabilities the backend cannot deliver.
export type SocialActionKind = "add" | "cancel" | "accept" | "decline" | "remove";

// "destructive" is not merely cosmetic — it is what stops "arkadaşlıktan
// çıkar" and "isteği iptal et" from looking identical to a positive
// action, which is the single most confusable pair in this UI.
export type SocialActionTone = "primary" | "neutral" | "destructive";

export interface SocialAction {
  kind: SocialActionKind;
  label: string;
  accessibilityLabel: string;
  tone: SocialActionTone;
  // Only "remove" confirms today, matching FriendshipButton's existing
  // Alert.alert flow — cancelling an outgoing request stays one tap, as it
  // already does.
  requiresConfirmation: boolean;
}

// What the public-profile action area should render right now. `hidden`
// covers the caller's own profile, where the screen renders no friendship
// control at all.
export type FriendshipViewState =
  | "hidden"
  | "loading"
  | "none"
  | "requested_by_me"
  | "requested_by_them"
  | "friends";

export interface FriendshipPresentation {
  view: FriendshipViewState;
  // A short, non-interactive description of the current relationship,
  // shown above the buttons so the state is readable without inferring it
  // from a button label.
  statusLabel: string | null;
  actions: SocialAction[];
  // True while a mutation is in flight: the buttons stay mounted and keep
  // their size (a spinner replaces the label in place) rather than being
  // unmounted, which is what previously made the whole action area jump.
  isBusy: boolean;
}

const ACTIONS: Record<SocialActionKind, SocialAction> = {
  add: {
    kind: "add",
    label: "Arkadaş Ekle",
    accessibilityLabel: "Arkadaşlık isteği gönder",
    tone: "primary",
    requiresConfirmation: false,
  },
  cancel: {
    kind: "cancel",
    label: "İsteği İptal Et",
    accessibilityLabel: "Gönderdiğin arkadaşlık isteğini iptal et",
    tone: "destructive",
    requiresConfirmation: false,
  },
  accept: {
    kind: "accept",
    label: "Kabul Et",
    accessibilityLabel: "Arkadaşlık isteğini kabul et",
    tone: "primary",
    requiresConfirmation: false,
  },
  decline: {
    kind: "decline",
    label: "Reddet",
    accessibilityLabel: "Arkadaşlık isteğini reddet",
    tone: "destructive",
    requiresConfirmation: false,
  },
  remove: {
    kind: "remove",
    label: "Arkadaşlıktan Çık",
    accessibilityLabel: "Bu kişiyi arkadaş listenden çıkar",
    tone: "destructive",
    requiresConfirmation: true,
  },
};

const STATUS_LABELS: Record<FriendshipViewState, string | null> = {
  hidden: null,
  loading: null,
  none: null,
  requested_by_me: "İstek gönderildi",
  requested_by_them: "Sana arkadaşlık isteği gönderdi",
  friends: "Arkadaşsınız",
};

const ACTIONS_BY_VIEW: Record<FriendshipViewState, SocialActionKind[]> = {
  hidden: [],
  loading: [],
  none: ["add"],
  requested_by_me: ["cancel"],
  requested_by_them: ["accept", "decline"],
  friends: ["remove"],
};

export function resolveFriendshipView(params: {
  buttonState: FriendshipButtonState;
  isOwnProfile: boolean;
  isLoading: boolean;
}): FriendshipViewState {
  // Order matters: the caller's own profile never shows a friendship
  // control, not even a loading placeholder.
  if (params.isOwnProfile) return "hidden";
  if (params.isLoading) return "loading";
  return params.buttonState;
}

// The single source of truth for "what does this relationship look like".
// Pure: no React, no Firebase, no navigation — the screen supplies the
// state its existing hook already computed, and wires the returned action
// kinds back to the hook's existing callbacks.
export function resolveFriendshipPresentation(params: {
  buttonState: FriendshipButtonState;
  isOwnProfile: boolean;
  isLoading: boolean;
  isMutating: boolean;
}): FriendshipPresentation {
  const view = resolveFriendshipView(params);
  return {
    view,
    statusLabel: STATUS_LABELS[view],
    actions: ACTIONS_BY_VIEW[view].map((kind) => ACTIONS[kind]),
    // A mutation on a hidden/loading view can never be in flight from this
    // screen, so it is normalized to false rather than propagated.
    isBusy: view === "hidden" || view === "loading" ? false : params.isMutating,
  };
}
