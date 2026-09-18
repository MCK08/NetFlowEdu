import AsyncStorage from "@react-native-async-storage/async-storage";

import { parsePlanStore, PlanStore, serializePlanStore } from "./planStore";

// Phase 108 — device storage for the plan-local store, keyed per account so
// two accounts on one device never share skips or preferences. Same
// AsyncStorage the active-session envelope already uses; no new dependency.

const KEY_PREFIX = "netflowedu.studyPlan.v1.";

export function planStorageKey(uid: string): string {
  return `${KEY_PREFIX}${uid}`;
}

export async function loadPlanStore(uid: string): Promise<PlanStore> {
  try {
    return parsePlanStore(await AsyncStorage.getItem(planStorageKey(uid)));
  } catch {
    return parsePlanStore(null);
  }
}

export async function savePlanStore(uid: string, store: PlanStore): Promise<void> {
  try {
    await AsyncStorage.setItem(planStorageKey(uid), serializePlanStore(store));
  } catch {
    // Storage is a convenience; a failed write only forgets a skip.
  }
}
