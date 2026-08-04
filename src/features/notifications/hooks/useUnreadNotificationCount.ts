import { useEffect, useState } from "react";

import { subscribeToUnreadCount } from "@services/firebase/notifications";

// The one realtime listener this feature opens per session (see
// notifications.ts's subscribeToUnreadCount doc comment) — shared by the
// header bell button and the notification screen's own header count so
// neither opens a second listener.
export function useUnreadNotificationCount(uid: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }
    return subscribeToUnreadCount(uid, setCount);
  }, [uid]);

  return count;
}
