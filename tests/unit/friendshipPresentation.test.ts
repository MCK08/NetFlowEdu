import {
  resolveFriendshipPresentation,
  resolveFriendshipView,
} from "@features/friends/services/friendshipPresentation";
import { FriendshipButtonState } from "@features/friends/services/friendshipState";

const ALL_STATES: FriendshipButtonState[] = [
  "none",
  "requested_by_me",
  "requested_by_them",
  "friends",
];

function present(
  buttonState: FriendshipButtonState,
  overrides: Partial<{ isOwnProfile: boolean; isLoading: boolean; isMutating: boolean }> = {},
) {
  return resolveFriendshipPresentation({
    buttonState,
    isOwnProfile: false,
    isLoading: false,
    isMutating: false,
    ...overrides,
  });
}

describe("resolveFriendshipView", () => {
  it("hides the control entirely on the caller's own profile, even while loading", () => {
    expect(
      resolveFriendshipView({ buttonState: "none", isOwnProfile: true, isLoading: true }),
    ).toBe("hidden");
  });

  it("reports loading before the relationship is known", () => {
    expect(
      resolveFriendshipView({ buttonState: "none", isOwnProfile: false, isLoading: true }),
    ).toBe("loading");
  });

  it("passes every real relationship state through once loaded", () => {
    for (const state of ALL_STATES) {
      expect(
        resolveFriendshipView({ buttonState: state, isOwnProfile: false, isLoading: false }),
      ).toBe(state);
    }
  });
});

describe("resolveFriendshipPresentation — every real state", () => {
  it("offers only 'add' when there is no relationship", () => {
    const result = present("none");
    expect(result.actions.map((a) => a.kind)).toEqual(["add"]);
    expect(result.actions[0]?.tone).toBe("primary");
    expect(result.statusLabel).toBeNull();
  });

  it("offers cancelling an outgoing request, and says the request was sent", () => {
    const result = present("requested_by_me");
    expect(result.actions.map((a) => a.kind)).toEqual(["cancel"]);
    expect(result.statusLabel).toBe("İstek gönderildi");
  });

  it("offers exactly accept and decline for an incoming request", () => {
    const result = present("requested_by_them");
    expect(result.actions.map((a) => a.kind)).toEqual(["accept", "decline"]);
    expect(result.statusLabel).toBe("Sana arkadaşlık isteği gönderdi");
  });

  it("offers removing an existing friendship, and says you are friends", () => {
    const result = present("friends");
    expect(result.actions.map((a) => a.kind)).toEqual(["remove"]);
    expect(result.statusLabel).toBe("Arkadaşsınız");
  });

  it("renders no action at all on the caller's own profile", () => {
    const result = present("none", { isOwnProfile: true });
    expect(result.view).toBe("hidden");
    expect(result.actions).toEqual([]);
    expect(result.statusLabel).toBeNull();
  });

  it("renders no action while the relationship is still loading", () => {
    const result = present("friends", { isLoading: true });
    expect(result.view).toBe("loading");
    expect(result.actions).toEqual([]);
  });
});

describe("resolveFriendshipPresentation — destructive vs positive distinction", () => {
  it("never marks a positive action destructive", () => {
    for (const state of ALL_STATES) {
      for (const action of present(state).actions) {
        if (action.kind === "add" || action.kind === "accept") {
          expect(action.tone).toBe("primary");
        }
      }
    }
  });

  it("marks every relationship-ending action destructive", () => {
    const destructiveKinds = ["cancel", "decline", "remove"];
    for (const state of ALL_STATES) {
      for (const action of present(state).actions) {
        if (destructiveKinds.includes(action.kind)) {
          expect(action.tone).toBe("destructive");
        }
      }
    }
  });

  it("requires confirmation only for removing an established friendship", () => {
    expect(present("friends").actions[0]?.requiresConfirmation).toBe(true);
    expect(present("requested_by_me").actions[0]?.requiresConfirmation).toBe(false);
    expect(present("none").actions[0]?.requiresConfirmation).toBe(false);
  });
});

describe("resolveFriendshipPresentation — busy state", () => {
  it("reports busy while a mutation is in flight on a visible state", () => {
    expect(present("none", { isMutating: true }).isBusy).toBe(true);
    expect(present("friends", { isMutating: true }).isBusy).toBe(true);
  });

  it("keeps the actions mounted while busy, so the layout cannot jump", () => {
    const result = present("requested_by_them", { isMutating: true });
    expect(result.actions.map((a) => a.kind)).toEqual(["accept", "decline"]);
  });

  it("never reports busy for a hidden or loading view", () => {
    expect(present("none", { isOwnProfile: true, isMutating: true }).isBusy).toBe(false);
    expect(present("none", { isLoading: true, isMutating: true }).isBusy).toBe(false);
  });
});

describe("resolveFriendshipPresentation — labels and accessibility", () => {
  it("gives every action a non-empty label and a distinct accessibility label", () => {
    for (const state of ALL_STATES) {
      for (const action of present(state).actions) {
        expect(action.label.length).toBeGreaterThan(0);
        expect(action.accessibilityLabel.length).toBeGreaterThan(0);
        expect(action.accessibilityLabel).not.toBe(action.label);
      }
    }
  });

  it("never exposes an unsupported action", () => {
    const supported = new Set(["add", "cancel", "accept", "decline", "remove"]);
    for (const state of ALL_STATES) {
      for (const action of present(state).actions) {
        expect(supported.has(action.kind)).toBe(true);
      }
    }
  });

  it("produces a distinct action set for every distinct relationship state", () => {
    const signatures = ALL_STATES.map((state) =>
      present(state)
        .actions.map((a) => a.kind)
        .join(","),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
