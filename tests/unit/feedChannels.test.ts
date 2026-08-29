import {
  channelDescriptor,
  channelsForRole,
  defaultChannelForRole,
  feedSessionKey,
  isChannelAllowedForRole,
  resolveChannelForRole,
} from "../../src/features/feed/services/feedChannels";

describe("channelsForRole", () => {
  it("gives the student the four launch channels, in bar order", () => {
    expect(channelsForRole("student").map((channel) => channel.id)).toEqual([
      "for_you",
      "discover",
      "my_classes",
      "struggles",
    ]);
  });

  it("gives the teacher its own four channels, in bar order", () => {
    expect(channelsForRole("teacher").map((channel) => channel.id)).toEqual([
      "discover",
      "my_class",
      "student_signals",
      "my_content",
    ]);
  });

  it("labels every channel in Turkish, with no empty label", () => {
    for (const role of ["student", "teacher"] as const) {
      for (const channel of channelsForRole(role)) {
        expect(channel.label.length).toBeGreaterThan(0);
        expect(channel.emptyTitle.length).toBeGreaterThan(0);
      }
    }
  });

  // A role with no feed must render no channel bar rather than a guessed one.
  it.each(["organization_admin", "platform_admin"] as const)(
    "gives %s no channels at all",
    (role) => {
      expect(channelsForRole(role)).toEqual([]);
    },
  );

  it("gives an unresolved role no channels rather than defaulting to student", () => {
    expect(channelsForRole(null)).toEqual([]);
    expect(channelsForRole(undefined)).toEqual([]);
  });
});

describe("defaultChannelForRole", () => {
  it("opens the student on Sana Özel", () => {
    expect(defaultChannelForRole("student")).toBe("for_you");
  });

  it("opens the teacher on Keşfet", () => {
    expect(defaultChannelForRole("teacher")).toBe("discover");
  });

  it("is null for a role with no channels", () => {
    expect(defaultChannelForRole(null)).toBeNull();
    expect(defaultChannelForRole("platform_admin")).toBeNull();
  });
});

describe("isChannelAllowedForRole — the account-switch guard", () => {
  it("accepts a channel belonging to the role", () => {
    expect(isChannelAllowedForRole("struggles", "student")).toBe(true);
    expect(isChannelAllowedForRole("my_content", "teacher")).toBe(true);
  });

  it("rejects a teacher-only channel for a student", () => {
    expect(isChannelAllowedForRole("my_content", "student")).toBe(false);
    expect(isChannelAllowedForRole("student_signals", "student")).toBe(false);
    expect(isChannelAllowedForRole("my_class", "student")).toBe(false);
  });

  it("rejects a student-only channel for a teacher", () => {
    expect(isChannelAllowedForRole("for_you", "teacher")).toBe(false);
    expect(isChannelAllowedForRole("struggles", "teacher")).toBe(false);
    expect(isChannelAllowedForRole("my_classes", "teacher")).toBe(false);
  });

  // "discover" is the one id both unions share — the exact case a naive
  // "keep the selected channel across a switch" would get away with, and
  // the reason every other id must be re-checked.
  it("accepts the shared discover channel for both roles", () => {
    expect(isChannelAllowedForRole("discover", "student")).toBe(true);
    expect(isChannelAllowedForRole("discover", "teacher")).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(isChannelAllowedForRole(null, "student")).toBe(false);
    expect(isChannelAllowedForRole(undefined, "student")).toBe(false);
  });
});

describe("resolveChannelForRole", () => {
  it("keeps a channel the role is allowed to be on", () => {
    expect(resolveChannelForRole("struggles", "student")).toBe("struggles");
  });

  // The core Phase 50 §22 regression: a teacher on "my_content" who switches
  // to a student account must NOT stay on a teacher channel.
  it("falls back to the role default when the carried-over channel is cross-role", () => {
    expect(resolveChannelForRole("my_content", "student")).toBe("for_you");
    expect(resolveChannelForRole("struggles", "teacher")).toBe("discover");
  });

  it("keeps the shared discover channel across a role switch", () => {
    expect(resolveChannelForRole("discover", "student")).toBe("discover");
    expect(resolveChannelForRole("discover", "teacher")).toBe("discover");
  });

  it("falls back to the role default when nothing is selected yet", () => {
    expect(resolveChannelForRole(null, "student")).toBe("for_you");
    expect(resolveChannelForRole(null, "teacher")).toBe("discover");
  });

  it("is null for a role with no channels, never a borrowed one", () => {
    expect(resolveChannelForRole("for_you", "platform_admin")).toBeNull();
    expect(resolveChannelForRole(null, null)).toBeNull();
  });

  it("is deterministic", () => {
    expect(resolveChannelForRole("my_content", "student")).toBe(
      resolveChannelForRole("my_content", "student"),
    );
  });
});

describe("channelDescriptor", () => {
  it("returns the descriptor for a channel the role has", () => {
    expect(channelDescriptor("struggles", "student")?.label).toBe("Zorlandıklarım");
    expect(channelDescriptor("student_signals", "teacher")?.label).toBe("Öğrenci Sinyalleri");
  });

  it("returns null for a channel the role does not have", () => {
    expect(channelDescriptor("my_content", "student")).toBeNull();
  });
});

describe("feedSessionKey — Phase 54 immersive pager session identity", () => {
  it("changes when the channel changes, so a stale rating card cannot survive", () => {
    expect(feedSessionKey("for_you", "|")).not.toBe(feedSessionKey("discover", "|"));
  });

  it("changes when the filter changes, preserving Phase 21's own reset contract", () => {
    expect(feedSessionKey("for_you", "Matematik||")).not.toBe(feedSessionKey("for_you", "|"));
  });

  it("is identical for identical channel + filter, so nothing resets on an unrelated re-render", () => {
    expect(feedSessionKey("struggles", "Matematik|9|Denklemler")).toBe(
      feedSessionKey("struggles", "Matematik|9|Denklemler"),
    );
  });

  // The exact pair a channel-blind key would have collided: same filter,
  // different pool.
  it("distinguishes two channels that share the same (empty) filter", () => {
    expect(feedSessionKey("my_classes", "|")).not.toBe(feedSessionKey("struggles", "|"));
  });

  it("is stable for a null channel rather than throwing", () => {
    expect(feedSessionKey(null, "|")).toBe(feedSessionKey(null, "|"));
    expect(feedSessionKey(null, "|")).not.toBe(feedSessionKey("for_you", "|"));
  });
});
