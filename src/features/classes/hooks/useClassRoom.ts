import { useEffect, useState } from "react";

import { getClassById } from "@services/firebase/classes";
import { ClassRoom } from "@/types/class";

// Phase 126 — the class document, and nothing else.
//
// A screen that only needs to NAME the class it was opened for has, until
// now, had two options: useClassDetail, which also fetches the member roster
// (a second read of a list the teacher surfaces already hold), or a private
// useEffect copied into the screen. This is the smallest correct source:
// ONE classes/{classId} get, once per mount, exactly the read
// useClassTopicComposer already makes for its own organizationId.
//
// `classRoom` stays null until it resolves, so a caller draws nothing rather
// than a placeholder name; a failed or missing document leaves it null for
// the same reason. This hook deliberately reports no error of its own —
// identity is supporting context, and a screen whose real content loaded
// should not show an error banner because a name did not.
export function useClassRoom(classId: string | undefined) {
  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null);

  useEffect(() => {
    if (!classId) {
      setClassRoom(null);
      return;
    }
    let cancelled = false;
    getClassById(classId)
      .then((room) => {
        if (!cancelled) setClassRoom(room);
      })
      .catch(() => {
        if (!cancelled) setClassRoom(null);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  return classRoom;
}
