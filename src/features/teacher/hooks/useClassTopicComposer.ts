import { useEffect, useState } from "react";

import { getClassById } from "@services/firebase/classes";
import type { ClassRoom } from "@/types/class";
import { Question } from "@/types/question";

import { ActionCenterComposerContext } from "../services/actionCenterNavigation";
import { useTeacherQuestionComposer } from "./useTeacherQuestionComposer";

// Phase 101 — the Action Center's "Müdahale Hazırla" composer, extracted from
// ClassPerformanceScreen verbatim so a second screen can offer the SAME one.
//
// Before this phase the composer existed only inside Sınıf Performansı, which
// was fine while the Action Center lived only there. The dedicated "Bugün Öne
// Çıkanlar" route renders the same rows, and a row that opened a different
// composer — or none — on that route would break the one promise the route
// makes: that it is the same Action Center, only complete. Copying the wiring
// would have been the duplicate CLAUDE.md forbids, so it moved here and both
// screens use it.
//
// Nothing about the composer changed: the same class-doc read for
// organizationId, the same useTeacherQuestionComposer, the same topic prefill.
// The composer's shared-vocabulary read is left to the CALLER, because Sınıf
// Performansı also needs those definitions for its cohort section on first
// paint, while the full route only needs them once the composer is open.

export interface ClassTopicComposer {
  composer: ReturnType<typeof useTeacherQuestionComposer>;
  /** Phase 125 — the class document this hook already reads for its
   *  organizationId, kept whole so a screen can name the class without a
   *  second fetch. Null until that one read resolves. */
  classRoom: ClassRoom | null;
  /** What the metadata sheet is prefilled with. Null for an unprefilled open. */
  topicContext: ActionCenterComposerContext | null;
  /** Prefill and open. Phase 43: gradeLevel is null when the topic's own
   *  questions do not agree on one — passed through, never guessed. */
  openForTopic: (subject: string, topic: string, gradeLevel: string | null) => void;
  /** Whether either composer step is on screen. */
  isOpen: boolean;
}

export function useClassTopicComposer(params: {
  classId: string;
  uid: string | undefined;
  onUploaded: (question: Question) => void;
}): ClassTopicComposer {
  const { classId, uid, onUploaded } = params;

  // ONE read: the class document, for the organizationId that satisfies
  // uploadClassQuestionImage's existing required parameter (the exact same
  // field useClassUpload/useStudentQuestionUpload already require).
  // useClassPerformance's own `getClassMembers` read doesn't carry
  // organizationId (it's a roster, not class metadata), so there's no
  // already-loaded value to reuse — a single classes/{classId} get() is the
  // smallest correct source. Read once per screen mount, not per composer
  // open, because openComposer refuses to start without it.
  //
  // Phase 125 — the WHOLE document is kept now rather than one field of it.
  // Sınıf Performansı has no class identity at all, and the smallest honest
  // way to give it one is the read this hook was already paying for: a
  // second getClassById for the name would be the duplicate class fetch the
  // phase forbids. Still one read, still on mount; `classRoom` is null until
  // it resolves, so nothing draws a placeholder name.
  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null);
  useEffect(() => {
    let cancelled = false;
    getClassById(classId).then((room) => {
      if (!cancelled) setClassRoom(room);
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);
  const organizationId = classRoom?.organizationId ?? null;

  const [topicContext, setTopicContext] = useState<ActionCenterComposerContext | null>(null);

  const composer = useTeacherQuestionComposer({
    uid,
    organizationId,
    classId,
    onUploaded,
  });

  function openForTopic(subject: string, topic: string, gradeLevel: string | null) {
    setTopicContext({ subject, topic, gradeLevel });
    composer.openComposer();
  }

  return {
    composer,
    classRoom,
    topicContext,
    openForTopic,
    isOpen: composer.isSourcePickerOpen || composer.pickedImageUri !== null,
  };
}
