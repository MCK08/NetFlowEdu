// Unit-tests functions/src/friends/socialMeta.ts's pure delta-application
// logic directly — the single place the "sayaçlar hiçbir zaman negatif
// olamaz" invariant (spec section 6) is actually enforced.

const SERVER_TIMESTAMP = "__SERVER_TIMESTAMP__";

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => SERVER_TIMESTAMP },
}));

// eslint-disable-next-line import/first
import { applyMetaDelta } from "../../functions/src/friends/socialMeta";

function fakeRef() {
  const writes: unknown[] = [];
  return {
    ref: {
      set: (data: unknown) => {
        writes.push(data);
      },
    },
    writes,
  };
}

describe("applyMetaDelta", () => {
  it("applies a positive delta on top of the current value", () => {
    const { ref, writes } = fakeRef();
    applyMetaDelta(
      { set: (r: typeof ref, d: unknown) => r.set(d) } as never,
      ref as never,
      { friendCount: 2, incomingRequestCount: 0, outgoingRequestCount: 0 },
      { friendCount: 1 },
    );
    expect(writes[0]).toMatchObject({ friendCount: 3 });
  });

  it("floors at zero — a delta that would go negative clamps to 0, never below", () => {
    const { ref, writes } = fakeRef();
    applyMetaDelta(
      { set: (r: typeof ref, d: unknown) => r.set(d) } as never,
      ref as never,
      { friendCount: 0, incomingRequestCount: 0, outgoingRequestCount: 0 },
      { friendCount: -1 },
    );
    expect(writes[0]).toMatchObject({ friendCount: 0 });
  });

  it("each field is floored independently", () => {
    const { ref, writes } = fakeRef();
    applyMetaDelta(
      { set: (r: typeof ref, d: unknown) => r.set(d) } as never,
      ref as never,
      { friendCount: 1, incomingRequestCount: 0, outgoingRequestCount: 1 },
      { friendCount: -5, incomingRequestCount: -5, outgoingRequestCount: -1 },
    );
    expect(writes[0]).toMatchObject({
      friendCount: 0,
      incomingRequestCount: 0,
      outgoingRequestCount: 0,
    });
  });
});
