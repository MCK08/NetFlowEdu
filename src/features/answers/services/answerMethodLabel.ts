import { AnswerMethod } from "../types";

export const ANSWER_METHOD_LABELS: Record<AnswerMethod, string> = {
  photo: "Fotoğraf",
  drawing: "Çizim",
};

export function getAnswerMethodLabel(method: AnswerMethod): string {
  return ANSWER_METHOD_LABELS[method];
}
