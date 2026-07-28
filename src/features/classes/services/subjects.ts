// Fixed list a student picks from when posting a class question — plain
// strings stored directly on Question.subject, no separate collection/id.
// Kept as a single source of truth here so the composer UI and any future
// validation both read the same list.
export const CLASS_QUESTION_SUBJECTS = [
  "Matematik",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Türkçe",
  "Tarih",
  "Coğrafya",
  "İngilizce",
  "Diğer",
] as const;

export type ClassQuestionSubject = (typeof CLASS_QUESTION_SUBJECTS)[number];

export function isKnownClassQuestionSubject(value: string): value is ClassQuestionSubject {
  return (CLASS_QUESTION_SUBJECTS as readonly string[]).includes(value);
}
