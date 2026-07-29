// Unit-tests the REAL friends/* handlers (imported straight from
// functions/src, not reimplemented) — same pattern as createClass.test.ts:
// onCall's CallableFunction.run(request) against an in-memory, path-keyed
// fake of firebase-admin's Firestore, no emulator needed.

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
      return { exists: data !== undefined, data: () => data, id: path.split("/").pop() };
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

function collectionRef(path: string) {
  return {
    doc(id?: string) {
      const docId = id ?? `auto-${++autoIdCounter}`;
      return docRef(`${path}/${docId}`);
    },
  };
}

function mockFakeDb() {
  return {
    collection(name: string) {
      return collectionRef(name);
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
  FieldValue: { serverTimestamp: () => SERVER_TIMESTAMP },
}));

// eslint-disable-next-line import/first
import { sendFriendRequest } from "../../functions/src/friends/sendFriendRequest";
// eslint-disable-next-line import/first
import { respondToFriendRequest } from "../../functions/src/friends/respondToFriendRequest";
// eslint-disable-next-line import/first
import { cancelFriendRequest } from "../../functions/src/friends/cancelFriendRequest";
// eslint-disable-next-line import/first
import { removeFriend } from "../../functions/src/friends/removeFriend";
// eslint-disable-next-line import/first
import { buildFriendshipPairId } from "../../functions/src/friends/pairId";

function seedUser(uid: string, role: string, accountStatus = "active") {
  store.set(`users/${uid}`, { role, accountStatus });
}

function meta(uid: string) {
  return store.get(`users/${uid}/socialMeta/summary`) as
    | { friendCount?: number; incomingRequestCount?: number; outgoingRequestCount?: number }
    | undefined;
}

function friendshipDoc(uidA: string, uidB: string) {
  return store.get(`friendships/${buildFriendshipPairId(uidA, uidB)}`);
}

function callerRequest(uid: string, data: Record<string, unknown>) {
  return { data, auth: { uid, token: {} } } as never;
}

function resetStore() {
  store.clear();
  autoIdCounter = 0;
}

beforeEach(resetStore);

describe("sendFriendRequest", () => {
  it("student -> student creates a pending request and bumps both counts exactly once", async () => {
    seedUser("s1", "student");
    seedUser("s2", "student");

    const result = await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));
    expect(result).toEqual({ status: "pending", created: true });

    const doc = friendshipDoc("s1", "s2");
    expect(doc).toMatchObject({ requesterId: "s1", recipientId: "s2", status: "pending" });
    expect(meta("s1")?.outgoingRequestCount).toBe(1);
    expect(meta("s2")?.incomingRequestCount).toBe(1);
  });

  it("student -> teacher succeeds", async () => {
    seedUser("s1", "student");
    seedUser("t1", "teacher");
    const result = await sendFriendRequest.run(callerRequest("s1", { otherUid: "t1" }));
    expect(result.created).toBe(true);
  });

  it("teacher -> student succeeds", async () => {
    seedUser("t1", "teacher");
    seedUser("s1", "student");
    const result = await sendFriendRequest.run(callerRequest("t1", { otherUid: "s1" }));
    expect(result.created).toBe(true);
  });

  it("teacher -> teacher succeeds", async () => {
    seedUser("t1", "teacher");
    seedUser("t2", "teacher");
    const result = await sendFriendRequest.run(callerRequest("t1", { otherUid: "t2" }));
    expect(result.created).toBe(true);
  });

  it("denies a self-request", async () => {
    seedUser("s1", "student");
    await expect(sendFriendRequest.run(callerRequest("s1", { otherUid: "s1" }))).rejects.toThrow();
    expect(friendshipDoc("s1", "s1")).toBeUndefined();
  });

  it("denies sending to an admin account", async () => {
    seedUser("s1", "student");
    seedUser("admin1", "organization_admin");
    await expect(
      sendFriendRequest.run(callerRequest("s1", { otherUid: "admin1" })),
    ).rejects.toThrow();
  });

  it("denies sending to an inactive account", async () => {
    seedUser("s1", "student");
    seedUser("s2", "student", "suspended");
    await expect(sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }))).rejects.toThrow();
  });

  it("denies an unauthenticated caller", async () => {
    await expect(
      sendFriendRequest.run({ data: { otherUid: "s2" }, auth: null } as never),
    ).rejects.toThrow();
  });

  it("a duplicate request from the same requester is idempotent — no second doc, counts unchanged", async () => {
    seedUser("s1", "student");
    seedUser("s2", "student");
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));
    const second = await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));

    expect(second).toEqual({ status: "pending", created: false });
    expect(meta("s1")?.outgoingRequestCount).toBe(1);
    expect(meta("s2")?.incomingRequestCount).toBe(1);
  });

  it("a reverse pending request (B sends to A while A->B is already pending) auto-accepts", async () => {
    seedUser("s1", "student");
    seedUser("s2", "student");
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));

    const result = await sendFriendRequest.run(callerRequest("s2", { otherUid: "s1" }));

    expect(result).toEqual({ status: "accepted", created: false });
    expect(friendshipDoc("s1", "s2")).toMatchObject({ status: "accepted" });
    expect(meta("s1")).toMatchObject({ outgoingRequestCount: 0, friendCount: 1 });
    expect(meta("s2")).toMatchObject({ incomingRequestCount: 0, friendCount: 1 });
  });

  it("denies sending a request to someone you're already friends with", async () => {
    seedUser("s1", "student");
    seedUser("s2", "student");
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));
    await sendFriendRequest.run(callerRequest("s2", { otherUid: "s1" })); // auto-accept
    await expect(sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }))).rejects.toThrow();
  });
});

describe("respondToFriendRequest", () => {
  async function seedPending(requester: string, recipient: string) {
    seedUser(requester, "student");
    seedUser(recipient, "student");
    await sendFriendRequest.run(callerRequest(requester, { otherUid: recipient }));
  }

  it("only the recipient may accept", async () => {
    await seedPending("s1", "s2");
    await expect(
      respondToFriendRequest.run(callerRequest("s1", { otherUid: "s2", action: "accept" })),
    ).rejects.toThrow();
  });

  it("accept creates an accepted relationship and bumps friendCount on both sides", async () => {
    await seedPending("s1", "s2");
    const result = await respondToFriendRequest.run(
      callerRequest("s2", { otherUid: "s1", action: "accept" }),
    );
    expect(result).toEqual({ status: "accepted" });
    expect(friendshipDoc("s1", "s2")).toMatchObject({ status: "accepted" });
    expect(meta("s1")).toMatchObject({ outgoingRequestCount: 0, friendCount: 1 });
    expect(meta("s2")).toMatchObject({ incomingRequestCount: 0, friendCount: 1 });
  });

  it("a repeated accept is a safe no-op — counts do not change a second time", async () => {
    await seedPending("s1", "s2");
    await respondToFriendRequest.run(callerRequest("s2", { otherUid: "s1", action: "accept" }));
    const second = await respondToFriendRequest.run(
      callerRequest("s2", { otherUid: "s1", action: "accept" }),
    );
    expect(second).toEqual({ status: "accepted" });
    expect(meta("s1")?.friendCount).toBe(1);
    expect(meta("s2")?.friendCount).toBe(1);
  });

  it("only the recipient may decline", async () => {
    await seedPending("s1", "s2");
    await expect(
      respondToFriendRequest.run(callerRequest("s1", { otherUid: "s2", action: "decline" })),
    ).rejects.toThrow();
  });

  it("decline deletes the relationship and decrements both pending counts", async () => {
    await seedPending("s1", "s2");
    const result = await respondToFriendRequest.run(
      callerRequest("s2", { otherUid: "s1", action: "decline" }),
    );
    expect(result).toEqual({ status: "declined" });
    expect(friendshipDoc("s1", "s2")).toBeUndefined();
    expect(meta("s1")?.outgoingRequestCount).toBe(0);
    expect(meta("s2")?.incomingRequestCount).toBe(0);
  });

  it("a repeated decline after the doc is already gone fails safely (not-found), never throws a raw crash", async () => {
    await seedPending("s1", "s2");
    await respondToFriendRequest.run(callerRequest("s2", { otherUid: "s1", action: "decline" }));
    await expect(
      respondToFriendRequest.run(callerRequest("s2", { otherUid: "s1", action: "decline" })),
    ).rejects.toThrow();
  });
});

describe("cancelFriendRequest", () => {
  async function seedPending(requester: string, recipient: string) {
    seedUser(requester, "student");
    seedUser(recipient, "student");
    await sendFriendRequest.run(callerRequest(requester, { otherUid: recipient }));
  }

  it("only the requester may cancel", async () => {
    await seedPending("s1", "s2");
    await expect(
      cancelFriendRequest.run(callerRequest("s2", { otherUid: "s1" })),
    ).rejects.toThrow();
  });

  it("cancel deletes the pending doc and decrements both counts", async () => {
    await seedPending("s1", "s2");
    const result = await cancelFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));
    expect(result).toEqual({ cancelled: true });
    expect(friendshipDoc("s1", "s2")).toBeUndefined();
    expect(meta("s1")?.outgoingRequestCount).toBe(0);
    expect(meta("s2")?.incomingRequestCount).toBe(0);
  });
});

describe("removeFriend", () => {
  async function seedAccepted(uidA: string, uidB: string) {
    seedUser(uidA, "student");
    seedUser(uidB, "student");
    await sendFriendRequest.run(callerRequest(uidA, { otherUid: uidB }));
    await sendFriendRequest.run(callerRequest(uidB, { otherUid: uidA })); // auto-accept
  }

  it("either participant may remove an accepted friendship", async () => {
    await seedAccepted("s1", "s2");
    const result = await removeFriend.run(callerRequest("s2", { otherUid: "s1" }));
    expect(result).toEqual({ removed: true });
    expect(friendshipDoc("s1", "s2")).toBeUndefined();
  });

  it("decrements friendCount on both sides, never below zero", async () => {
    await seedAccepted("s1", "s2");
    await removeFriend.run(callerRequest("s1", { otherUid: "s2" }));
    expect(meta("s1")?.friendCount).toBe(0);
    expect(meta("s2")?.friendCount).toBe(0);
  });

  it("a repeated remove after the doc is already gone fails safely, never goes negative", async () => {
    await seedAccepted("s1", "s2");
    await removeFriend.run(callerRequest("s1", { otherUid: "s2" }));
    await expect(removeFriend.run(callerRequest("s1", { otherUid: "s2" }))).rejects.toThrow();
    expect(meta("s1")?.friendCount).toBe(0);
  });

  it("denies removing a still-pending (not yet accepted) request", async () => {
    seedUser("s1", "student");
    seedUser("s2", "student");
    await sendFriendRequest.run(callerRequest("s1", { otherUid: "s2" }));
    await expect(removeFriend.run(callerRequest("s1", { otherUid: "s2" }))).rejects.toThrow();
  });
});
