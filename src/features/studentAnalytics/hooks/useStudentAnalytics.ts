import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { mapStudyErrorToMessage } from "@features/study/services/studyErrorMapper";
import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";
import { getAllStudyItems } from "@features/study/services/studyService";

import { AnalyticsItem, toAnalyticsItem } from "../services/studentAnalytics";

// Phase 107 — the one read path behind every Kişisel Analiz screen.
//
// DATA COST
//
// Exactly the path useLearningInsights already uses: ONE bounded
// getAllStudyItems query, then question metadata through the shared
// studyMetadataCache — which never issues one read per item for a question
// already resolved this session, and deliberately does not batch (see that
// file for why a mixed-visibility batch fails as a whole). No new collection,
// no listener, no per-row fetch. Every aggregate is then derived in memory.
//
// Reloads on focus, the same rule the Study Hub follows. The archive exists so
// that a retry made on another screen shows up the moment the student comes
// back to it; a snapshot frozen at first mount would contradict that.
export function useStudentAnalytics(uid: string | undefined) {
  const [items, setItems] = useState<AnalyticsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the items on screen were read. Screens use this as "now" for every
  // time-relative reading (the 7/30-day window, "Son deneme: Dün"), so those
  // move with each reload yet stay stable between renders of one snapshot.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const requestIdRef = useRef(0);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  const load = useCallback(async () => {
    if (!uid) {
      setItems([]);
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const studyItems = await getAllStudyItems(uid);
      const metadata = await resolveQuestionMetadata(studyItems.map((item) => item.questionId));
      // A response for a previous request or a previous account is dropped,
      // never merged — same guard useLearningInsights uses.
      if (requestIdRef.current !== requestId || activeUidRef.current !== uid) return;
      setItems(studyItems.map((item) => toAnalyticsItem(item, metadata.get(item.questionId) ?? null)));
      setLoadedAt(Date.now());
      setHasLoaded(true);
    } catch (err) {
      if (requestIdRef.current !== requestId || activeUidRef.current !== uid) return;
      setError(mapStudyErrorToMessage(err));
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { items, loadedAt, isLoading, hasLoaded, error, refresh: load };
}
