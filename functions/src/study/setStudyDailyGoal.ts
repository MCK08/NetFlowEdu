import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { resolveTimeZone } from "./dayKey";
import {
  DEFAULT_DAILY_GOAL,
  isValidDailyGoal,
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  STUDY_SCHEMA_VERSION,
} from "./studyTypes";

// The daily goal lives on the server-owned summary document (which
// firestore.rules makes client-unwritable, same as socialMeta/
// notificationMeta), so changing it needs a callable rather than a direct
// write. Out-of-range values are REJECTED, not silently clamped: a goal of
// 0 would make `goalCompleted` meaningless, and quietly changing what the
// user asked for is worse than telling them it was invalid.
export const setStudyDailyGoal = onCall<{ dailyGoal: number; timeZone?: string }>(
  { region: "us-central1" },
  async (request): Promise<{ dailyGoal: number }> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    if (caller.token.role !== "student") {
      throw new HttpsError("permission-denied", "Çalışma hedefi yalnızca öğrenciler içindir.");
    }

    const dailyGoal = request.data?.dailyGoal;
    if (!isValidDailyGoal(dailyGoal)) {
      throw new HttpsError(
        "invalid-argument",
        `Günlük hedef ${MIN_DAILY_GOAL} ile ${MAX_DAILY_GOAL} arasında bir tam sayı olmalı.`,
      );
    }

    const now = Date.now();
    const db = getFirestore();
    const summaryRef = db.collection("users").doc(caller.uid).collection("studyMeta").doc("summary");

    // merge:true so this never clobbers streak/progress fields it doesn't
    // own. Defaults are supplied only for a summary that doesn't exist yet.
    await summaryRef.set(
      {
        dailyGoal,
        timeZone: resolveTimeZone(request.data?.timeZone),
        schemaVersion: STUDY_SCHEMA_VERSION,
        updatedAt: now,
      },
      { merge: true },
    );

    return { dailyGoal };
  },
);

export { DEFAULT_DAILY_GOAL };
