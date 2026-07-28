import {
  createKeyedNavigationLock,
  DEFAULT_MAX_HOLD_MS,
} from "@utils/navigationGuard";

// Real-device bug (verified on iPhone): double-tapping the comment button in
// the class feed pushed the question-detail screen TWICE. A first fix used a
// fixed 600ms cooldown and did NOT fix it on hardware.
//
// These tests model what actually happens in the component — handlers are
// rebuilt on every render, while the lock must survive renders (useRef) —
// rather than only calling one guard function twice in a row, which is what
// the first test suite did and why it passed while the device stayed broken.

// Mirrors what ClassFeedCard does each render: rebuild the tap handlers,
// closing over whatever lock instance it was given.
function buildHandlers(lock: ReturnType<typeof createKeyedNavigationLock>, push: jest.Mock) {
  const go = (key: string, path: string) => {
    if (!lock.acquire(key)) return;
    push(path);
  };
  return {
    openComments: () => go("comments", "/question/q1"),
    openAnswer: () => go("answer", "/answer/q1"),
    openTeacher: () => go("profile", "/user/t1"),
  };
}

describe("createKeyedNavigationLock — same-render double tap", () => {
  it("only navigates once when the same button is tapped twice", () => {
    const push = jest.fn();
    const lock = createKeyedNavigationLock();
    const h = buildHandlers(lock, push);

    h.openComments();
    h.openComments();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/question/q1");
  });
});

describe("the real-device scenario: tap -> re-render -> tap", () => {
  // This is the test the previous suite was missing. The first tap changes
  // state (navigation, like counts, etc.) and the component re-renders,
  // rebuilding its handlers. The lock must be the SAME instance afterwards.
  it("navigates only once across a re-render when the lock is persisted (useRef behaviour)", () => {
    const push = jest.fn();
    const persistentLock = createKeyedNavigationLock(); // what useRef gives us

    const firstRender = buildHandlers(persistentLock, push);
    firstRender.openComments(); // tap 1

    // ...component re-renders, handlers are rebuilt from the same lock...
    const secondRender = buildHandlers(persistentLock, push);
    secondRender.openComments(); // tap 2

    expect(push).toHaveBeenCalledTimes(1);
  });

  // Documents precisely WHY useRef is required. If the lock is rebuilt on
  // each render, the guard is useless — this is the failure mode
  // useNavigationGuard's lazy useRef init exists to prevent.
  it("[proves the bug] navigates TWICE if the lock is recreated on every render", () => {
    const push = jest.fn();

    const firstRender = buildHandlers(createKeyedNavigationLock(), push);
    firstRender.openComments();

    const secondRender = buildHandlers(createKeyedNavigationLock(), push);
    secondRender.openComments();

    expect(push).toHaveBeenCalledTimes(2); // the bug, made explicit
  });
});

describe("slow navigation — why a fixed cooldown was the wrong primitive", () => {
  it("stays locked even when the second tap lands long after a 600ms cooldown would have expired", () => {
    const push = jest.fn();
    const lock = createKeyedNavigationLock();
    const go = () => {
      if (!lock.acquire("comments", nowRef.value)) return;
      push("/question/q1");
    };
    const nowRef = { value: 0 };

    nowRef.value = 0;
    go(); // tap 1
    // The push animation + destination mount took ~1.2s; the student is
    // still looking at the feed and taps again. A 600ms cooldown would have
    // expired here and allowed a second push.
    nowRef.value = 1_200;
    go(); // tap 2

    expect(push).toHaveBeenCalledTimes(1);
  });

  it("releases on focus (the user came back), allowing a genuine new navigation", () => {
    const push = jest.fn();
    const lock = createKeyedNavigationLock();
    const go = (now: number) => {
      if (!lock.acquire("comments", now)) return;
      push("/question/q1");
    };

    go(0);
    lock.releaseAll(); // useFocusEffect fires when the screen is focused again
    go(50); // a legitimate second visit, even 50ms later

    expect(push).toHaveBeenCalledTimes(2);
  });

  it("self-heals after maxHoldMs so a failed navigation can never permanently disable a button", () => {
    const lock = createKeyedNavigationLock(10_000);
    expect(lock.acquire("comments", 0)).toBe(true);
    expect(lock.acquire("comments", 9_999)).toBe(false);
    expect(lock.acquire("comments", 10_000)).toBe(true);
  });
});

describe("per-destination isolation", () => {
  it("tapping comments does not lock the Cevapla button", () => {
    const push = jest.fn();
    const lock = createKeyedNavigationLock();
    const h = buildHandlers(lock, push);

    h.openComments();
    h.openAnswer(); // a different destination — must still go through

    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenNthCalledWith(1, "/question/q1");
    expect(push).toHaveBeenNthCalledWith(2, "/answer/q1");
  });

  it("each destination is independently double-tap protected", () => {
    const push = jest.fn();
    const lock = createKeyedNavigationLock();
    const h = buildHandlers(lock, push);

    h.openComments();
    h.openComments();
    h.openAnswer();
    h.openAnswer();
    h.openTeacher();
    h.openTeacher();

    expect(push).toHaveBeenCalledTimes(3);
  });

  it("releaseAll unlocks every destination at once", () => {
    const lock = createKeyedNavigationLock();
    lock.acquire("comments", 0);
    lock.acquire("answer", 0);
    expect(lock.isLocked("comments", 10)).toBe(true);
    expect(lock.isLocked("answer", 10)).toBe(true);

    lock.releaseAll();

    expect(lock.isLocked("comments", 10)).toBe(false);
    expect(lock.isLocked("answer", 10)).toBe(false);
  });
});

describe("params integrity under rapid tapping", () => {
  it("the single accepted navigation still carries the correct destination", () => {
    const push = jest.fn();
    const lock = createKeyedNavigationLock();
    const go = (id: string) => {
      if (!lock.acquire("answer")) return;
      push({ pathname: "/answer/[questionId]", params: { questionId: id } });
    };

    go("q-42");
    go("q-42");

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: "/answer/[questionId]",
      params: { questionId: "q-42" },
    });
  });
});

describe("defaults", () => {
  it("uses a self-heal window long enough to cover a slow push but not forever", () => {
    expect(DEFAULT_MAX_HOLD_MS).toBeGreaterThanOrEqual(5_000);
    expect(DEFAULT_MAX_HOLD_MS).toBeLessThanOrEqual(30_000);
  });
});
