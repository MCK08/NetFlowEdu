import {
  collection,
  collectionGroup,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "./config";
import { ClassMember, ClassRoom } from "@/types/class";

function toClassRoom(id: string, data: DocumentData): ClassRoom {
  return {
    id,
    name: data.name ?? "",
    organizationId: data.organizationId ?? null,
    teacherId: data.teacherId ?? "",
    joinCode: data.joinCode ?? "",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0,
    memberCount: data.memberCount ?? 0,
    status: data.status ?? "active",
  };
}

function toClassMember(data: DocumentData): ClassMember {
  return {
    uid: data.uid ?? "",
    role: data.role ?? "student",
    joinedAt: data.joinedAt instanceof Timestamp ? data.joinedAt.toMillis() : 0,
    displayName: data.displayName ?? "",
    username: data.username ?? null,
    photoURL: data.photoURL ?? null,
  };
}

export async function getClassById(classId: string): Promise<ClassRoom | null> {
  const snapshot = await getDoc(doc(db, "classes", classId));
  if (!snapshot.exists()) return null;
  return toClassRoom(snapshot.id, snapshot.data());
}

// A teacher's own classes — bounded list, no pagination needed for an MVP
// (a single teacher realistically has a handful of classes).
export async function getTeacherClasses(teacherId: string): Promise<ClassRoom[]> {
  const q = query(
    collection(db, "classes"),
    where("teacherId", "==", teacherId),
    orderBy("createdAt", "desc"),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => toClassRoom(d.id, d.data()));
}

// A student's joined classes, via the classes/{classId}/members collection
// group — every member doc's id/uid field equals the caller's own uid, so
// firestore.rules' isOwner(memberUid) check on each returned doc passes.
// Each membership row only carries {classId via the doc path, ...}, so this
// resolves the parent class docs in a second pass.
export async function getStudentClasses(uid: string): Promise<ClassRoom[]> {
  const membershipQuery = query(collectionGroup(db, "members"), where("uid", "==", uid));
  const membershipSnapshot = await getDocs(membershipQuery);

  const classDocs = await Promise.all(
    membershipSnapshot.docs.map((memberDoc) => {
      const classRef = memberDoc.ref.parent.parent;
      return classRef ? getDoc(classRef) : Promise.resolve(null);
    }),
  );

  const rooms: ClassRoom[] = [];
  for (const snap of classDocs) {
    if (snap !== null && snap.exists()) {
      rooms.push(toClassRoom(snap.id, snap.data()));
    }
  }
  return rooms.sort((a, b) => b.createdAt - a.createdAt);
}

// Teacher-only (see firestore.rules' classes/{classId}/members/{memberUid}
// read rule) — the member list shown on the class detail screen.
export async function getClassMembers(classId: string): Promise<ClassMember[]> {
  const snapshot = await getDocs(collection(db, "classes", classId, "members"));
  return snapshot.docs.map((d) => toClassMember(d.data())).sort((a, b) => a.joinedAt - b.joinedAt);
}

export async function getMyClassMembership(
  classId: string,
  uid: string,
): Promise<ClassMember | null> {
  const snapshot = await getDoc(doc(db, "classes", classId, "members", uid));
  if (!snapshot.exists()) return null;
  return toClassMember(snapshot.data());
}
