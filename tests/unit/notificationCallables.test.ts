// Unit-tests the REAL notification-producing callable handlers (imported
// straight from functions/src, not reimplemented) against an in-memory,
// path-keyed fake of firebase-admin's Firestore — same pattern as
// friendsCallables.test.ts.
//
// SCOPE BOUNDARY: this fake models sequential behaviour only. Anything
// whose correctness depends on real transaction serialization or
// pessimistic locking (markAllNotificationsRead) is tested against the
// actual Firestore emulator instead — see
// tests/integration/markAllNotificationsRead.emulator.test.ts.

type DocData = Record<string, unknown>;
const store = new Map<string, DocData>();
const SERVER_TIMESTAMP = "__SERVER_TIMESTAMP__";
let autoIdCounter = 0;

function docRef(path: string) {
  return {
    id: path.split("/").pop()!,
    path,
    async get() {
      const data = store.get(path);
      return { exists: data !== undefined, data: () => data, id: path.split("/").pop(), ref: docRef(path) };
    },
    async set(data: DocData, options?: { merge?: boolean }) {
      if (options?.merge) {
        store.set(path, { ...(store.get(path) ?? {}), ...data });
      } else {
        store.set(path, { ...data });
      }
    },
    async update(data: DocData) {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
    },
    async delete() {
      store.delete(path);
    },
    collection(name: string) {
      return collectionRef(`${path}/${name}`);
    },
  };
}

function docsUnderPrefix(prefix: string) {
  const results: { id: string; path: string; data: DocData }[] = [];
  for (const [path, data] of store.entries()) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (rest.includes("/")) continue; // only direct children, not deeper subcollections
    results.push({ id: rest, path, data });
  }
  return results;
}

function collectionRef(path: string) {
  return {
    doc(id?: string) {
      const docId = id ?? `auto-${++autoIdCounter}`;
      return docRef(`${path}/${docId}`);
    },
    where(field: string, op: string, value: unknown) {
      if (op !== "==") throw new Error(`fake Firestore only supports '==' — got '${op}'`);
      return {
        limit(n: number) {
          return {
            async get() {
              const matches = docsUnderPrefix(`${path}/`).filter((d) => d.data[field] === value);
              const limited = matches.slice(0, n);
              return {
                empty: limited.length === 0,
                size: limited.length,
                docs: limited.map((d) => ({ id: d.id, ref: docRef(d.path), data: () => d.data })),
              };
            },
          };
        },
      };
    },
  };
}

function mockFakeDb() {
  return {
    collection(name: string) {
      return collectionRef(name);
    },
    batch() {
      const ops: (() => void)[] = [];
      return {
        update(ref: { path: string }, data: DocData) {
          ops.push(() => store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data }));
        },
        async commit() {
          for (const op of ops) op();
        },
      };
    },
    async runTransaction(fn: (tx: unknown) => Promise<unknown>) {
      const tx = {
        get: (ref: { get: () => unknown }) => ref.get(),
        set: (
          ref: { set: (d: DocData, o?: { merge?: boolean }) => unknown },
          data: DocData,
          options?: { merge?: boolean },
        ) => ref.set(data, options),
        update: (ref: { update: (d: DocData) => unknown }, data: DocData) => ref.update(data),
        delete: (ref: { delete: () => unknown }) => ref.delete(),
      };
      return fn(tx);
    },
  };
}

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => mockFakeDb(),
  FieldValue: {
    serverTimestamp: () => SERVER_TIMESTAMP,
    increment: (n: number) => ({ __increment__: n }),
  },
}));

// eslint-disable-next-line import/first
import { toggleQuestionLike } from "../../functions/src/social/toggleQuestionLike";
// eslint-disable-next-line import/first
import { toggleAnswerLike } from "../../functions/src/social/toggleAnswerLike";
// eslint-disable-next-line import/first
import { sendFriendRequest } from "../../functions/src/friends/sendFriendRequest";
// eslint-disable-next-line import/first
import { respondToFriendRequest } from "../../functions/src/friends/respondToFriendRequest";
// eslint-disable-next-line import/first
import { joinClassByCode } from "../../functions/src/classes/joinClassByCode";
// eslint-disable-next-line import/first
import { markAllNotificationsRead } from "../../functions/src/notifications/markAllNotificationsRead";
// eslint-disable-next-line import/first
import { markNotificationRead } from "../../functions/src/notifications/markNotificationRead";
// eslint-disable-next-line import/first
import { buildFriendshipPairId } from "../../functions/src/friends/pairId";

function seedUser(uid: string, overrides: DocData = {}) {
  store.set(`users/${uid}`, {
    role: "student",
    accountStatus: "active",
    displayName: uid,
    username: uid,
    photoURL: null,
    ...overrides,
  });
}

function seedQuestion(id: string, ownerId: string, overrides: DocData = {}) {
  store.set(`questions/${id}`, {
    ownerId,
    visibility: "public",
    likeCount: 0,
    // Student-owned by default — matches every existing fixture's actual
    // intent. Pass posterRole: "teacher" explicitly for the teacher-gate
    // tests below.
    posterRole: "student",
    ...overrides,
  });
}

function seedAnswer(id: string, ownerId: string, questionId: string, overrides: DocData = {}) {
  store.set(`answers/${id}`, { ownerId, questionId, likeCount: 0, ...overrides });
}

function notificationsFor(uid: string) {
  return docsUnderPrefix(`users/${uid}/notifications/`).map((d) => d.data);
}

function seedNotificationDoc(
  recipientUid: string,
  notificationId: string,
  overrides: DocData = {},
) {
  store.set(`users/${recipientUid}/notifications/${notificationId}`, {
    recipientId: recipientUid,
    actorId: "actor1",
    type: "question_liked",
    isRead: false,
    readAt: null,
    ...overrides,
  });
}

function unreadCountFor(uid: string): number {
  const meta = store.get(`users/${uid}/notificationMeta/summary`);
  return typeof meta?.unreadCount === "number" ? meta.unreadCount : 0;
}

function callerRequest(uid: string, data: Record<string, unknown>, token: DocData = {}) {
  return { data, auth: { uid, token } } as never;
}

function resetStore() {
  store.clear();
  autoIdCounter = 0;
}

beforeEach(resetStore);

describe("notification creation — self-notification guard", () => {
  it("liking your own question never creates a notification for yourself", async () => {
    seedUser("owner1");
    seedQuestion("q1", "owner1");

    await toggleQuestionLike.run(callerRequest("owner1", { questionId: "q1" }));

    expect(notificationsFor("owner1")).toHaveLength(0);
  });
});

describe("notification creation — correct recipient", () => {
  it("question_liked goes to the question owner, not the liker", async () => {
    seedUser("owner1");
    seedUser("liker1");
    seedQuestion("q1", "owner1");

    await toggleQuestionLike.run(callerRequest("liker1", { questionId: "q1" }));

    expect(notificationsFor("owner1")).toHaveLength(1);
    expect(notificationsFor("liker1")).toHaveLength(0);
    expect(notificationsFor("owner1")[0]).toMatchObject({
      type: "question_liked",
      actorId: "liker1",
      recipientId: "owner1",
      entityId: "q1",
    });
  });

  it("answer_liked goes to the answer owner and carries the parent question id", async () => {
    seedUser("qOwner");
    seedUser("aOwner");
    seedUser("liker1");
    seedQuestion("q1", "qOwner");
    seedAnswer("ans1", "aOwner", "q1");

    await toggleAnswerLike.run(callerRequest("liker1", { answerId: "ans1" }));

    expect(notificationsFor("aOwner")).toHaveLength(1);
    expect(notificationsFor("aOwner")[0]).toMatchObject({
      type: "answer_liked",
      entityId: "ans1",
      parentEntityId: "q1",
    });
  });
});

describe("notification creation — teacher question-notification gap (pre-commit hardening)", () => {
  it("liking a TEACHER-owned question creates no notification at all (no usable destination exists yet)", async () => {
    seedUser("teacher1", { role: "teacher" });
    seedUser("liker1");
    seedQuestion("q1", "teacher1", { posterRole: "teacher" });

    await toggleQuestionLike.run(callerRequest("liker1", { questionId: "q1" }));

    expect(notificationsFor("teacher1")).toHaveLength(0);
    expect(unreadCountFor("teacher1")).toBe(0);
  });

  it("liking an ANSWER owned by a teacher-role account creates no notification", async () => {
    seedUser("qOwner");
    seedUser("teacherAnswerer", { role: "teacher" });
    seedUser("liker1");
    seedQuestion("q1", "qOwner");
    seedAnswer("ans1", "teacherAnswerer", "q1");

    await toggleAnswerLike.run(callerRequest("liker1", { answerId: "ans1" }));

    expect(notificationsFor("teacherAnswerer")).toHaveLength(0);
  });

  it("a normal student-owned question still gets notified (the gate is scoped, not a global regression)", async () => {
    seedUser("studentOwner");
    seedUser("liker1");
    seedQuestion("q1", "studentOwner", { posterRole: "student" });

    await toggleQuestionLike.run(callerRequest("liker1", { questionId: "q1" }));

    expect(notificationsFor("studentOwner")).toHaveLength(1);
  });
});

describe("notification creation — toggle dedupe / unlike removal", () => {
  it("like creates exactly one notification; unlike removes it; re-liking recreates exactly one (never accumulates)", async () => {
    seedUser("owner1");
    seedUser("liker1");
    seedQuestion("q1", "owner1");

    await toggleQuestionLike.run(callerRequest("liker1", { questionId: "q1" }));
    expect(notificationsFor("owner1")).toHaveLength(1);
    expect(unreadCountFor("owner1")).toBe(1);

    await toggleQuestionLike.run(callerRequest("liker1", { questionId: "q1" })); // unlike
    expect(notificationsFor("owner1")).toHaveLength(0);
    expect(unreadCountFor("owner1")).toBe(0);

    await toggleQuestionLike.run(callerRequest("liker1", { questionId: "q1" })); // like again
    expect(notificationsFor("owner1")).toHaveLength(1);
    expect(unreadCountFor("owner1")).toBe(1);
  });

  it("a duplicate send-friend-request call (idempotent no-op) never doubles the notification", async () => {
    seedUser("s1");
    seedUser("s2");

    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));
    expect(notificationsFor("s2")).toHaveLength(1);

    // Re-submitting the caller's own still-pending request is a documented
    // no-op (see sendFriendRequest.ts) — must not create a second
    // notification for s2.
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));
    expect(notificationsFor("s2")).toHaveLength(1);
  });
});

describe("notification creation — friendship flows", () => {
  it("sendFriendRequest notifies the recipient with friend_request_received", async () => {
    seedUser("s1");
    seedUser("s2");

    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));

    expect(notificationsFor("s2")[0]).toMatchObject({
      type: "friend_request_received",
      actorId: "s1",
      recipientId: "s2",
    });
  });

  it("respondToFriendRequest(accept) notifies the ORIGINAL requester with friend_request_accepted", async () => {
    seedUser("s1");
    seedUser("s2");
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));

    await respondToFriendRequest.run(callerRequest("s2", { otherUid: "s1", action: "accept" }));

    const s1Notifications = notificationsFor("s1");
    const accepted = s1Notifications.find((n) => n.type === "friend_request_accepted");
    expect(accepted).toMatchObject({ actorId: "s2", recipientId: "s1" });
  });

  it("respondToFriendRequest(decline) sends no notification (silent by design)", async () => {
    seedUser("s1");
    seedUser("s2");
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));

    await respondToFriendRequest.run(callerRequest("s2", { otherUid: "s1", action: "decline" }));

    expect(notificationsFor("s1").some((n) => n.type === "friend_request_accepted")).toBe(false);
  });

  it("a reverse pending request (mutual auto-accept) notifies the original requester as accepted, and the original recipient got the initial received notification", async () => {
    seedUser("s1");
    seedUser("s2");
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" })); // s1 -> s2 pending

    await sendFriendRequest.run(callerRequest("s2", { otherUid: "s1" })); // s2 sends back -> auto-accept

    // s2 received the original pending request notification.
    expect(notificationsFor("s2").filter((n) => n.type === "friend_request_received")).toHaveLength(1);
    // s1 (the ORIGINAL requester) is notified that it was accepted, by s2's action.
    const s1Notifications = notificationsFor("s1");
    expect(s1Notifications.filter((n) => n.type === "friend_request_accepted")).toHaveLength(1);
    expect(s1Notifications.find((n) => n.type === "friend_request_accepted")).toMatchObject({
      actorId: "s2",
      recipientId: "s1",
    });
  });
});

describe("notification creation — class activity", () => {
  it("joinClassByCode notifies the teacher with class_student_joined", async () => {
    seedUser("teacher1", { role: "teacher" });
    seedUser("student1", { role: "student" });
    store.set("classes/c1", {
      name: "10-A Matematik",
      teacherId: "teacher1",
      status: "active",
      memberCount: 1,
    });
    store.set("classJoinCodes/ABC123", { classId: "c1" });

    await joinClassByCode.run(callerRequest("student1", { code: "ABC123" }, { role: "student" }));

    expect(notificationsFor("teacher1")[0]).toMatchObject({
      type: "class_student_joined",
      actorId: "student1",
      recipientId: "teacher1",
      classId: "c1",
      messagePreview: "10-A Matematik",
    });
  });

  it("re-joining (idempotent alreadyMember path) never creates a second notification", async () => {
    seedUser("teacher1", { role: "teacher" });
    seedUser("student1", { role: "student" });
    store.set("classes/c1", { name: "10-A", teacherId: "teacher1", status: "active", memberCount: 1 });
    store.set("classJoinCodes/ABC123", { classId: "c1" });

    await joinClassByCode.run(callerRequest("student1", { code: "ABC123" }, { role: "student" }));
    await joinClassByCode.run(callerRequest("student1", { code: "ABC123" }, { role: "student" }));

    expect(notificationsFor("teacher1")).toHaveLength(1);
  });
});

describe("markNotificationRead", () => {
  it("unread -> read: decrements unreadCount by exactly 1", async () => {
    seedUser("u1");
    seedNotificationDoc("u1", "n1", { recipientId: "u1" });
    store.set("users/u1/notificationMeta/summary", { unreadCount: 1 });

    const result = await markNotificationRead.run(callerRequest("u1", { notificationId: "n1" }));

    expect(result).toEqual({ alreadyRead: false });
    expect(store.get("users/u1/notifications/n1")?.isRead).toBe(true);
    expect(store.get("users/u1/notifications/n1")?.readAt).toBe(SERVER_TIMESTAMP);
    expect(unreadCountFor("u1")).toBe(0);
  });

  it("already read -> read again: unreadCount does not change (idempotent)", async () => {
    seedUser("u1");
    seedNotificationDoc("u1", "n1", { recipientId: "u1", isRead: true, readAt: 12345 });
    store.set("users/u1/notificationMeta/summary", { unreadCount: 0 });

    const result = await markNotificationRead.run(callerRequest("u1", { notificationId: "n1" }));

    expect(result).toEqual({ alreadyRead: true });
    expect(unreadCountFor("u1")).toBe(0);
    // The original readAt is untouched — a no-op never overwrites it.
    expect(store.get("users/u1/notifications/n1")?.readAt).toBe(12345);
  });

  // NOTE on concurrency: this in-memory fake has no real optimistic-
  // concurrency/retry behavior — it cannot simulate two truly simultaneous
  // Firestore transactions racing on the same document (that guarantee is
  // Firestore's own server-side transaction serialization, only observable
  // against the real emulator/production). What IS provable here, and what
  // that serialization actually reduces every race down to, is this: the
  // loser of any real race is retried by the SDK and sees the WINNER's
  // already-committed state — i.e. exactly the "already read" sequential
  // case above. Two back-to-back calls on the same notification therefore
  // exercise the identical code path a genuine concurrent retry would hit,
  // and is what actually prevents a double-decrement.
  it("two sequential calls on the same notification (the shape of a retried race) decrement exactly once", async () => {
    seedUser("u1");
    seedNotificationDoc("u1", "n1", { recipientId: "u1" });
    store.set("users/u1/notificationMeta/summary", { unreadCount: 1 });

    const first = await markNotificationRead.run(callerRequest("u1", { notificationId: "n1" }));
    const second = await markNotificationRead.run(callerRequest("u1", { notificationId: "n1" }));

    expect(first.alreadyRead).toBe(false);
    expect(second.alreadyRead).toBe(true);
    expect(unreadCountFor("u1")).toBe(0);
  });

  // The document path is scoped to the CALLER's own uid
  // (users/{caller.uid}/notifications/{id}) — another user's notification
  // simply doesn't exist under that path, so this resolves to not-found
  // rather than permission-denied. This is the safer outcome, not a
  // downgrade: it never confirms to an attacker that a given notification
  // id exists at all under someone else's account.
  it("never reaches another user's notification — resolves not-found rather than leaking its existence", async () => {
    seedUser("u1");
    seedUser("attacker");
    seedNotificationDoc("u1", "n1", { recipientId: "u1" });

    await expect(
      markNotificationRead.run(callerRequest("attacker", { notificationId: "n1" })),
    ).rejects.toMatchObject({ code: "not-found" });
    // u1's notification and unread state are completely untouched.
    expect(store.get("users/u1/notifications/n1")?.isRead).toBe(false);
  });

  // The recipientId cross-check inside markNotificationRead.ts still
  // matters defensively even though the path above already scopes reads
  // to the caller's own subcollection — this proves the belt-and-suspenders
  // check itself, for the case where a notification doc somehow exists
  // under the caller's OWN path but was recorded for a different
  // recipientId (should never happen given how createNotificationInTransaction
  // writes it, but the rule fires regardless of how the mismatch arose).
  it("rejects with permission-denied if a notification under the caller's own path has a mismatched recipientId", async () => {
    seedUser("u1");
    seedNotificationDoc("u1", "n1", { recipientId: "someone-else" });

    await expect(
      markNotificationRead.run(callerRequest("u1", { notificationId: "n1" })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects a non-existent notification with not-found", async () => {
    seedUser("u1");
    await expect(
      markNotificationRead.run(callerRequest("u1", { notificationId: "does-not-exist" })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("never drives unreadCount negative even if the summary is already 0", async () => {
    seedUser("u1");
    seedNotificationDoc("u1", "n1", { recipientId: "u1" });
    store.set("users/u1/notificationMeta/summary", { unreadCount: 0 });

    await markNotificationRead.run(callerRequest("u1", { notificationId: "n1" }));

    expect(unreadCountFor("u1")).toBe(0);
  });

  it("rejects an unauthenticated call", async () => {
    await expect(
      markNotificationRead.run({ data: { notificationId: "n1" }, auth: null } as never),
    ).rejects.toThrow();
  });

  it("rejects a missing notificationId", async () => {
    seedUser("u1");
    await expect(markNotificationRead.run(callerRequest("u1", {}))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

// markAllNotificationsRead's DATA behaviour is deliberately NOT tested
// against this in-memory fake. Its correctness now rests entirely on
// Firestore transaction serialization and the pessimistic lock
// Transaction.get(query) takes on returned documents — neither of which a
// hand-rolled fake can represent, so a passing test here would prove
// nothing about the real guarantee and would be misleading to present as
// concurrency evidence. That coverage lives in
// tests/integration/markAllNotificationsRead.emulator.test.ts, which runs
// the REAL exported markAllNotificationsReadForUid against the actual
// Firestore emulator, including two genuinely simultaneous calls and a
// concurrent notification create.
//
// What IS meaningful to assert here is the callable wrapper's own
// pre-Firestore guard.
describe("markAllNotificationsRead (callable wrapper guard only)", () => {
  it("rejects an unauthenticated call before touching Firestore", async () => {
    await expect(
      markAllNotificationsRead.run({ data: {}, auth: null } as never),
    ).rejects.toThrow();
  });
});

describe("buildFriendshipPairId sanity (shared with friendsCallables.test.ts's fixtures)", () => {
  it("is used as the friendship notification's entityId", async () => {
    seedUser("s1");
    seedUser("s2");
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));
    const expectedPairId = buildFriendshipPairId("s1", "s2");
    expect(notificationsFor("s2")[0]?.entityId).toBe(expectedPairId);
  });
});
