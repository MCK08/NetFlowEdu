import indexesConfig from "../../firestore.indexes.json";

interface IndexField {
  fieldPath: string;
  order?: string;
  arrayConfig?: string;
}

interface IndexDefinition {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
}

const indexes = (indexesConfig as { indexes: IndexDefinition[] }).indexes;

// Production incident (2026-07-27): getTeacherClasses (src/services/firebase/
// classes.ts) runs where("teacherId","==",uid) + orderBy("createdAt","desc")
// — a composite query that Firestore refuses to run without a matching
// index. No such index existed for the "classes" collection at all. The
// createClass Cloud Function itself succeeded every time (verified directly
// against production: the class document was created correctly) — the
// failure was entirely in the very next step, useTeacherClasses.createClass's
// own `await load()` call, which re-runs this exact query and hit
// `FAILED_PRECONDITION: The query requires an index.` (reproduced verbatim
// against production Firestore). Because this same query also runs on
// TeacherClassesScreen's initial mount, a teacher's class list never loaded
// at all, not just right after creating one.
//
// This test can't spin up real Firestore to prove the query itself succeeds
// (the rules emulator doesn't enforce production index requirements), but it
// directly encodes the one fact that caused the incident: this exact
// composite index must exist in the deployed config. Removing it (or
// reordering/misordering the fields) fails this test immediately, instead of
// only surfacing in production the next time a teacher tries to create or
// view their classes.
describe("firestore.indexes.json — classes composite index", () => {
  it("has an index for classes on teacherId (==) + createdAt (desc) — required by getTeacherClasses", () => {
    const match = indexes.find((index) => {
      if (index.collectionGroup !== "classes" || index.fields.length !== 2) return false;
      const [first, second] = index.fields;
      return (
        first?.fieldPath === "teacherId" &&
        first?.order === "ASCENDING" &&
        second?.fieldPath === "createdAt" &&
        second?.order === "DESCENDING"
      );
    });
    expect(match).toBeDefined();
  });
});

// Phase 8 (student class feed): the immersive feed pages through
// getClassQuestionsPage, whose query is
//   where("classId","==",id) + where("visibility","==","class")
//   + orderBy("createdAt","desc")
// Two equality filters plus a range/order on a third field is a composite
// query — Firestore refuses it with FAILED_PRECONDITION unless this exact
// index exists, and the failure would only appear in production (the rules
// emulator does not enforce index requirements, so the emulator-backed
// LIST-authorization tests in tests/integration/firestore.rules.test.ts pass
// either way). Same reasoning as the classes index above: encode the
// requirement here so removing or reordering the fields fails immediately.
//
// Field ORDER matters: Firestore matches equality fields in the order
// declared, then the ordered field last.
describe("firestore.indexes.json — class questions composite index", () => {
  it("has an index for questions on classId (==) + visibility (==) + createdAt (desc) — required by getClassQuestionsPage", () => {
    const match = indexes.find((index) => {
      if (index.collectionGroup !== "questions" || index.fields.length !== 3) return false;
      const [first, second, third] = index.fields;
      return (
        first?.fieldPath === "classId" &&
        first?.order === "ASCENDING" &&
        second?.fieldPath === "visibility" &&
        second?.order === "ASCENDING" &&
        third?.fieldPath === "createdAt" &&
        third?.order === "DESCENDING"
      );
    });
    expect(match).toBeDefined();
  });

  it("still has the public feed index (visibility + createdAt) — the class feed must not have replaced it", () => {
    const match = indexes.find((index) => {
      if (index.collectionGroup !== "questions" || index.fields.length !== 2) return false;
      const [first, second] = index.fields;
      return (
        first?.fieldPath === "visibility" &&
        first?.order === "ASCENDING" &&
        second?.fieldPath === "createdAt" &&
        second?.order === "DESCENDING"
      );
    });
    expect(match).toBeDefined();
  });
});
