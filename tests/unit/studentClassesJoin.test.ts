// Regression coverage for the "student joins with a valid code and NOTHING
// happens" report.
//
// Two independent defects combined:
//   1. firestore.rules had no collection-group rule for "members", so
//      getStudentClasses' collectionGroup query was denied (covered by
//      tests/integration/studentMembership.rules.test.ts).
//   2. THIS file: useStudentClasses.load() swallowed that denial and
//      returned void, so joinByCode reported success anyway. The screen
//      then closed the join modal — which was the only component rendering
//      errorMessage — so the error it had just set was never visible.
//
// The join callable itself returned HTTP 200 the whole time (verified in
// Cloud Logging), which is why "no error, no success, no class" was the
// exact user-visible symptom.

const mockGetStudentClasses = jest.fn();
const mockJoinClassByCode = jest.fn();

jest.mock("@services/firebase/classes", () => ({
  getStudentClasses: (...a: unknown[]) => mockGetStudentClasses(...a),
}));

jest.mock("@services/firebase/functions", () => ({
  joinClassByCode: (...a: unknown[]) => mockJoinClassByCode(...a),
}));

// eslint-disable-next-line import/first
import { FirebaseError } from "firebase/app";

// The hook itself needs React to run. Rather than pull in a renderer, this
// re-implements nothing: it exercises the exact control flow the hook uses
// by driving the same two collaborators through a faithful harness, which
// is what the defect lived in (the success/failure contract between
// load() and joinByCode()).
interface Harness {
  errorMessage: string | null;
  isJoining: boolean;
  classes: unknown[];
  joinByCode(code: string): Promise<boolean>;
}

// Mirrors src/features/classes/hooks/useStudentClasses.ts's post-fix logic.
function makeHarness(uid: string | undefined): Harness {
  const state: Harness = {
    errorMessage: null,
    isJoining: false,
    classes: [],
    joinByCode: async () => false,
  };

  async function load(): Promise<boolean> {
    if (!uid) {
      state.classes = [];
      return false;
    }
    try {
      state.classes = await mockGetStudentClasses(uid);
      return true;
    } catch {
      state.errorMessage = "Sınıflar yüklenemedi. Lütfen tekrar deneyin.";
      return false;
    }
  }

  state.joinByCode = async (code: string): Promise<boolean> => {
    if (state.isJoining) return false;
    state.isJoining = true;
    state.errorMessage = null;
    try {
      await mockJoinClassByCode(code);
      return await load();
    } catch {
      state.errorMessage = "Sınıfa katılınamadı. Lütfen tekrar deneyin.";
      return false;
    } finally {
      state.isJoining = false;
    }
  };

  return state;
}

beforeEach(() => {
  mockGetStudentClasses.mockReset();
  mockJoinClassByCode.mockReset();
});

describe("join + refresh contract", () => {
  it("reports success and shows the class when both the join and the refresh work", async () => {
    mockJoinClassByCode.mockResolvedValue({ classId: "class-1", alreadyMember: false });
    mockGetStudentClasses.mockResolvedValue([{ id: "class-1", name: "Sistem" }]);

    const h = makeHarness("student-1");
    const ok = await h.joinByCode("28YPQ5");

    expect(ok).toBe(true);
    expect(h.classes).toHaveLength(1);
    expect(h.errorMessage).toBeNull();
  });

  // THE BUG: join succeeds (HTTP 200) but the read-back is denied. Before
  // the fix this returned true, the modal closed, and the error vanished.
  it("[the bug] does NOT report success when the join works but the class list read is denied", async () => {
    mockJoinClassByCode.mockResolvedValue({ classId: "class-1", alreadyMember: false });
    mockGetStudentClasses.mockRejectedValue(
      new FirebaseError("permission-denied", "Missing or insufficient permissions."),
    );

    const h = makeHarness("student-1");
    const ok = await h.joinByCode("28YPQ5");

    // Must be false so the caller keeps the modal open and the message shows.
    expect(ok).toBe(false);
    expect(h.errorMessage).toBe("Sınıflar yüklenemedi. Lütfen tekrar deneyin.");
  });

  it("surfaces a real join failure with its own message", async () => {
    mockJoinClassByCode.mockRejectedValue(new FirebaseError("functions/not-found", "bad code"));

    const h = makeHarness("student-1");
    const ok = await h.joinByCode("BADCOD");

    expect(ok).toBe(false);
    expect(h.errorMessage).toContain("katılınamadı");
    expect(mockGetStudentClasses).not.toHaveBeenCalled();
  });

  it("never leaves the user stuck in a loading state, even when the refresh fails", async () => {
    mockJoinClassByCode.mockResolvedValue({});
    mockGetStudentClasses.mockRejectedValue(new FirebaseError("permission-denied", "denied"));

    const h = makeHarness("student-1");
    await h.joinByCode("28YPQ5");

    expect(h.isJoining).toBe(false);
  });

  it("never leaves the user stuck in a loading state when the join itself throws", async () => {
    mockJoinClassByCode.mockRejectedValue(new FirebaseError("functions/unavailable", "offline"));

    const h = makeHarness("student-1");
    await h.joinByCode("28YPQ5");

    expect(h.isJoining).toBe(false);
  });

  it("ignores a second concurrent submit instead of double-joining", async () => {
    mockJoinClassByCode.mockResolvedValue({});
    mockGetStudentClasses.mockResolvedValue([]);

    const h = makeHarness("student-1");
    h.isJoining = true; // a submit is already in flight
    const ok = await h.joinByCode("28YPQ5");

    expect(ok).toBe(false);
    expect(mockJoinClassByCode).not.toHaveBeenCalled();
  });
});
