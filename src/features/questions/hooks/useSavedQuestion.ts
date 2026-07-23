import { useEffect, useState } from "react";

import { isQuestionSaved, saveQuestion, unsaveQuestion } from "@services/questions/savedQuestions";
import { Question } from "@/types/question";

export function useSavedQuestion(question: Question, uid: string | undefined) {
  const [saved, setSaved] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (!uid) {
      setSaved(false);
      return;
    }
    let cancelled = false;
    isQuestionSaved(uid, question.id)
      .then((state) => {
        if (!cancelled) setSaved(state);
      })
      .catch(() => {
        // Non-fatal — bookmark state just defaults to "not saved".
      });
    return () => {
      cancelled = true;
    };
  }, [uid, question.id]);

  async function toggle() {
    if (!uid || isToggling) return;
    const previousSaved = saved;
    setSaved(!previousSaved);
    setIsToggling(true);
    try {
      if (previousSaved) {
        await unsaveQuestion(uid, question.id);
      } else {
        await saveQuestion(uid, question);
      }
    } catch {
      setSaved(previousSaved);
    } finally {
      setIsToggling(false);
    }
  }

  return { saved, isToggling, toggle };
}
