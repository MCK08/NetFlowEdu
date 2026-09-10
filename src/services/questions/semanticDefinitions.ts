import {
  collection,
  doc,
  DocumentData,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import {
  MAX_CLASS_SEMANTIC_DEFINITIONS,
  parseSemanticDefinition,
  sanitizeSemanticDefinition,
  SemanticDefinition,
  SemanticDefinitionInput,
  SEMANTIC_DEFINITION_SCHEMA_VERSION,
} from "@features/questions/services/semanticDefinition";
import { db } from "@services/firebase/config";

// Phase 80 — reading and writing one class's shared instructional vocabulary.
//
// WHY A SUBCOLLECTION OF THE CLASS
//
// Because the class is the only server-authoritative scope in this repository
// that more than one question author can legitimately share. It has an owning
// teacher on the document, a members subcollection written exclusively by
// Cloud Functions, and existing rules helpers (classData, isClassMember,
// classMemberData) that every other class-scoped resource already defers to.
// Putting the vocabulary anywhere else would have meant inventing a second
// membership model to authorise it.
//
// WHY NOT A TOP-LEVEL COLLECTION
//
// A top-level `semanticDefinitions` would have needed a classId field plus a
// rule that re-derives authorisation from it on every read and write — the
// same permission, expressed twice, in a place where the two could drift. The
// path IS the scope here, which is also what makes a cross-class read
// impossible to express by accident.

function definitionsRef(classId: string) {
  return collection(db, "classes", classId, "semanticDefinitions");
}

/** One bounded read of a class's whole vocabulary.
 *
 *  Deliberately one-shot rather than a listener: a vocabulary changes when a
 *  teacher deliberately adds to it, which is a handful of times ever, and a
 *  live subscription would cost a connection on every composer open to observe
 *  almost nothing. Archived entries are included so an existing question can
 *  still show what it references — filtering for NEW selection is the pure
 *  selectableDefinitions', not this function's, job. */
export async function getClassSemanticDefinitions(
  classId: string,
): Promise<SemanticDefinition[]> {
  if (!classId) return [];
  const snapshot = await getDocs(
    query(definitionsRef(classId), limit(MAX_CLASS_SEMANTIC_DEFINITIONS)),
  );
  return snapshot.docs
    .map((d) => parseSemanticDefinition(d.id, d.data() as DocumentData))
    .filter((definition): definition is SemanticDefinition => definition !== null);
}

/** Creates one definition and returns it, or null when the input is not usable.
 *
 *  The id is Firestore's own — opaque, stable, and carrying no meaning. That is
 *  the point: identity must not be derivable from the label, or two authors
 *  renaming toward each other would silently merge two different meanings. */
export async function createSemanticDefinition(params: {
  classId: string;
  createdBy: string;
  input: SemanticDefinitionInput;
}): Promise<SemanticDefinition | null> {
  const clean = sanitizeSemanticDefinition(params.input);
  if (!clean || !params.classId || !params.createdBy) return null;

  const ref = doc(definitionsRef(params.classId));
  const now = Date.now();
  await setDoc(ref, {
    classId: params.classId,
    label: clean.label,
    description: clean.description,
    // Immutable from here. A definition that could be re-scoped would silently
    // re-group every historical pattern that referenced it.
    subject: clean.subject,
    topic: clean.topic,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    archived: false,
    schemaVersion: SEMANTIC_DEFINITION_SCHEMA_VERSION,
  });

  // Returned optimistically with a local clock so the composer can select it
  // immediately. The server timestamps are what persist; these two fields are
  // only used for ordering in a list the author is already looking at.
  return {
    id: ref.id,
    classId: params.classId,
    label: clean.label,
    description: clean.description,
    subject: clean.subject,
    topic: clean.topic,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
    archived: false,
    schemaVersion: SEMANTIC_DEFINITION_SCHEMA_VERSION,
  };
}

/** Retires a definition from new selection.
 *
 *  Archiving, never deleting. Questions reference these by id and events record
 *  that id forever; deleting one would leave both pointing at nothing, and
 *  would silently break a student's historical pattern rather than tidy it up.
 *  The rules deny delete outright for the same reason. */
export async function setSemanticDefinitionArchived(
  classId: string,
  definitionId: string,
  archived: boolean,
): Promise<void> {
  await updateDoc(doc(definitionsRef(classId), definitionId), {
    archived,
    updatedAt: serverTimestamp(),
  });
}
