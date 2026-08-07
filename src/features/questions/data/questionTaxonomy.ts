// Central taxonomy for a question's metadata (Phase 21). Deliberately its
// own file, not hardcoded into the composer UI, so any future screen that
// needs the same lists (a future filter UI, a teacher composer, ...) reads
// the exact same source instead of copy-pasting.
//
// Subject reuses the EXISTING fixed list a class question already picks
// from (src/features/classes/services/subjects.ts) rather than minting a
// second, parallel subject taxonomy — that list was already the single
// source of truth for "Ders" everywhere subject selection existed before
// this phase.
import { CLASS_QUESTION_SUBJECTS } from "@features/classes/services/subjects";

export const QUESTION_SUBJECTS = CLASS_QUESTION_SUBJECTS;
export type QuestionSubject = (typeof QUESTION_SUBJECTS)[number];

// Turkish K-12 secondary grade levels — the ones a "soru" (exam-prep
// question) product realistically targets. "Diğer" is the same universal
// escape hatch CLASS_QUESTION_SUBJECTS already ends on, for a question that
// doesn't map cleanly to a single grade (e.g. a general-knowledge item).
export const GRADE_LEVELS = ["5", "6", "7", "8", "9", "10", "11", "12", "Diğer"] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

// A small, curated starter topic list per subject — good enough to make
// "Konu" a real dropdown selection (never free text, per this phase's own
// spec) without claiming to be an exhaustive curriculum. Every subject
// (including any not explicitly curated below) always resolves to at least
// ["Diğer"] via getTopicsForSubject, so the topic step is never left with
// zero options.
const TOPICS_BY_SUBJECT: Partial<Record<QuestionSubject, readonly string[]>> = {
  Matematik: ["Sayılar", "Cebir", "Denklemler", "Fonksiyonlar", "Geometri", "Olasılık", "Diğer"],
  Fizik: ["Mekanik", "Elektrik", "Optik", "Enerji", "Dalgalar", "Diğer"],
  Kimya: ["Atom ve Periyodik Sistem", "Kimyasal Bağlar", "Karışımlar", "Asit-Baz", "Diğer"],
  Biyoloji: ["Hücre", "Genetik", "Ekosistem", "İnsan Fizyolojisi", "Diğer"],
  Türkçe: ["Dil Bilgisi", "Anlam Bilgisi", "Paragraf", "Yazım Kuralları", "Diğer"],
  Tarih: ["Osmanlı Tarihi", "Cumhuriyet Tarihi", "Dünya Tarihi", "Diğer"],
  Coğrafya: ["Fiziki Coğrafya", "Beşeri Coğrafya", "Türkiye Coğrafyası", "Diğer"],
  İngilizce: ["Grammar", "Vocabulary", "Reading", "Diğer"],
};

const FALLBACK_TOPICS: readonly string[] = ["Diğer"];

// Always returns at least one option ("Diğer") — never an empty list, so a
// subject with no curated topics still lets the user complete the
// mandatory "Konu" step instead of getting stuck.
export function getTopicsForSubject(subject: string): readonly string[] {
  return TOPICS_BY_SUBJECT[subject as QuestionSubject] ?? FALLBACK_TOPICS;
}
