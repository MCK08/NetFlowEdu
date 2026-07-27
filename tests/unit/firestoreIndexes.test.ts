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
