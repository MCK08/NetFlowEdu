import { UserProfile } from "@/types/user";
import { subscribeToUserProfile } from "@services/firebase/firestore";

// The onUserCreate Cloud Function trigger creates users/{uid} asynchronously
// after Firebase Auth account creation — there's an unavoidable gap between
// "account exists" and "profile document exists". This bounds that wait
// instead of polling forever, so registration can't hang indefinitely if
// the trigger is slow, misconfigured, or (in emulator dev) not running.
export function waitForProfileDocument(uid: string, timeoutMs = 8000): Promise<UserProfile | null> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;

    const finish = (profile: UserProfile | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(profile);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    unsubscribe = subscribeToUserProfile(
      uid,
      (profile) => {
        if (profile !== null) finish(profile);
      },
      () => finish(null),
    );
  });
}
