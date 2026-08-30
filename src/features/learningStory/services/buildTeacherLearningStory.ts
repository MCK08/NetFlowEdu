import { StudentAttentionCard } from "@features/teacher/services/studentAttention";

import {
  TeacherLearningStory,
  TeacherStorySection,
  TeacherStorySectionKind,
} from "./learningStoryTypes";

// Phase 56 — the class-level counterpart. Pure, and reads ONLY the attention
// cards useClassPerformance already builds, so it adds no query of its own.
//
// STORY, NOT ACTION
//
// Daily Flow already tells a teacher what to do next. This answers the
// different question "how is the class changing", so it deliberately stops at
// context plus a route into the existing per-student intelligence. Emitting
// its own recommendations would create a second, competing teacher
// recommendation surface.
//
// OBSERVATIONAL WORDING ONLY
//
// Every sentence below describes what the evidence shows, never why. The
// product cannot attribute a change to a teacher's action — that is exactly
// the causal claim Phase 44's attribution work was careful not to make — so
// nothing here says an intervention "worked".

// Which attention categories become which story section. `insufficient_data`
// is intentionally absent: a class where nothing is known yet gets the
// first-run state, not a section counting students the product cannot
// describe.
const SECTION_BY_CATEGORY: Partial<Record<string, TeacherStorySectionKind>> = {
  progressing: "recovering",
  needs_attention: "persistent_struggle",
  watch: "watch",
  strong: "progressing",
};

// Narrative order, same principle as the student side: what is improving
// first, then what needs watching, then what is stuck.
const SECTION_ORDER: readonly TeacherStorySectionKind[] = [
  "recovering",
  "progressing",
  "watch",
  "persistent_struggle",
];

const SECTION_COPY: Record<
  TeacherStorySectionKind,
  { title: string; describe: (count: number) => string }
> = {
  recovering: {
    title: "Toparlananlar",
    describe: (count) => `${count} öğrencide toparlanma sinyali görülüyor.`,
  },
  progressing: {
    title: "Güçlü Durumdakiler",
    describe: (count) => `${count} öğrenci bu sınıfta güçlü durumda.`,
  },
  watch: {
    title: "Takip Gerektirenler",
    describe: (count) => `${count} öğrenci takip edilmeyi bekliyor.`,
  },
  persistent_struggle: {
    title: "Tekrar Eden Zorlanmalar",
    describe: (count) => `${count} öğrencide tekrar eden zorlanma görülüyor.`,
  },
};

export function buildTeacherLearningStory(
  cards: readonly StudentAttentionCard[],
): TeacherLearningStory {
  const buckets = new Map<TeacherStorySectionKind, string[]>();

  for (const card of cards) {
    const kind = SECTION_BY_CATEGORY[card.insight.category];
    if (!kind) continue;
    const existing = buckets.get(kind);
    if (existing) {
      existing.push(card.studentUid);
    } else {
      buckets.set(kind, [card.studentUid]);
    }
  }

  const sections: TeacherStorySection[] = [];
  for (const kind of SECTION_ORDER) {
    const studentUids = buckets.get(kind);
    // An empty section is simply not emitted (§24) — a "0 öğrenci" row is a
    // count the teacher has to read and then discard.
    if (!studentUids || studentUids.length === 0) continue;
    const copy = SECTION_COPY[kind];
    sections.push({
      id: kind,
      title: copy.title,
      description: copy.describe(studentUids.length),
      studentCount: studentUids.length,
      // Sorted so the routing target list is stable between renders.
      studentUids: [...studentUids].sort((a, b) => a.localeCompare(b)),
    });
  }

  if (sections.length === 0) {
    return {
      headline: "Öğrenciler çalıştıkça sınıfın ilerleme hikâyesi burada oluşacak",
      subheadline: null,
      sections: [],
      isFirstRun: true,
    };
  }

  // The subheadline states SCOPE, not a repeat of the first section.
  // Echoing the lead section's sentence here rendered the same line twice on
  // screen, one directly above the other, which read as a bug rather than a
  // summary.
  const describedStudents = new Set(sections.flatMap((section) => section.studentUids)).size;

  return {
    headline: "Sınıfın ilerleme hikâyesi",
    subheadline: `${describedStudents} öğrencinin kayıtlı sonuçlarına göre.`,
    sections,
    isFirstRun: false,
  };
}
