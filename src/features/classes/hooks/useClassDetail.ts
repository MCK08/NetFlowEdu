import { useCallback, useEffect, useState } from "react";

import { getClassById, getClassMembers } from "@services/firebase/classes";
import { regenerateClassJoinCode, removeClassMember } from "@services/firebase/functions";
import { ClassMember, ClassRoom } from "@/types/class";

// Backs the teacher's class detail screen — the class doc plus its member
// list (teacher-only read, see firestore.rules), with the mutation actions
// that only the owning teacher may perform.
export function useClassDetail(classId: string | undefined) {
  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const load = useCallback(async () => {
    if (!classId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [room, memberList] = await Promise.all([
        getClassById(classId),
        getClassMembers(classId),
      ]);
      setClassRoom(room);
      setMembers(memberList);
    } catch {
      setErrorMessage("Sınıf bilgileri yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  async function removeMember(memberUid: string): Promise<void> {
    if (!classId || isMutating) return;
    setIsMutating(true);
    try {
      await removeClassMember(classId, memberUid);
      await load();
    } catch {
      setErrorMessage("Üye çıkarılamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsMutating(false);
    }
  }

  async function regenerateCode(): Promise<void> {
    if (!classId || isMutating) return;
    setIsMutating(true);
    try {
      await regenerateClassJoinCode(classId);
      await load();
    } catch {
      setErrorMessage("Kod yenilenemedi. Lütfen tekrar deneyin.");
    } finally {
      setIsMutating(false);
    }
  }

  return {
    classRoom,
    members,
    isLoading,
    isMutating,
    errorMessage,
    removeMember,
    regenerateCode,
    refresh: load,
  };
}
