import { useEffect, useState } from "react";

import { getClassById } from "@services/firebase/classes";
import { ClassRoom } from "@/types/class";

// A student reading their own joined class's info — firestore.rules allows
// this via isClassMember(classId), same read path as getClassById used by
// the teacher's detail screen.
export function useStudentClassInfo(classId: string | undefined) {
  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!classId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getClassById(classId)
      .then((room) => {
        if (!cancelled) setClassRoom(room);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  return { classRoom, isLoading };
}
