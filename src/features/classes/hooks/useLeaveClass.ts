import { useState } from "react";

import { leaveClass as leaveClassCallable } from "@services/firebase/functions";

export function useLeaveClass() {
  const [isLeaving, setIsLeaving] = useState(false);

  async function leave(classId: string): Promise<boolean> {
    if (isLeaving) return false;
    setIsLeaving(true);
    try {
      await leaveClassCallable(classId);
      return true;
    } catch {
      return false;
    } finally {
      setIsLeaving(false);
    }
  }

  return { isLeaving, leave };
}
