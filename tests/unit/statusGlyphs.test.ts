import { readFileSync } from "fs";
import { join } from "path";

import {
  assignmentEffectivenessGlyph,
  attentionCategoryGlyph,
  interventionEffectivenessGlyph,
  learningTrendGlyph,
} from "@features/teacher/services/statusGlyphs";

// Phase 104 (Wave B) — the teacher's state words share ONE glyph vocabulary.
//
// Before this phase the class summary, the priority rows, both trend lines,
// the intervention verdict and the assignment outcome each spliced an OS
// emoji into their string ("🔴 Öğrenci F", "📉 Geriliyor", "➡️ Değişiklik
// yok"): a traffic light in one place, a boxed arrow in another, none of it
// themed and none of it matching the Action Center's own marks. The
// vocabulary is pinned here; the words themselves are unchanged and are
// still what assistive technology reads.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const TONES = new Set(["danger", "success", "primary", "neutral", "muted"]);

// Every file that used to carry a status emoji.
const FORMER_EMOJI_SITES = [
  "src/features/teacher/screens/ClassPerformanceScreen.tsx",
  "src/features/teacher/screens/StudentPerformanceScreen.tsx",
  "src/features/teacher/components/InterventionOutcomeCard.tsx",
  "src/features/assignments/screens/AssignmentDetailScreen.tsx",
];

// Coloured discs, arrows, ticks, warning signs, charts, stars — the set that
// was in use, plus the generic emoji planes so a new one cannot creep back.
const STATUS_EMOJI = /[\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{26AA}\u{1F31F}\u{1F4C8}\u{1F4C9}\u{27A1}\u{26A0}\u{2705}]/u;

describe("the glyph vocabulary", () => {
  it("gives every attention category a mark and a palette tone", () => {
    const categories = ["needs_attention", "watch", "progressing", "strong", "insufficient_data"] as const;
    for (const category of categories) {
      const glyph = attentionCategoryGlyph(category);
      expect(glyph.icon.length).toBeGreaterThan(0);
      expect(TONES.has(glyph.tone)).toBe(true);
    }
    expect(attentionCategoryGlyph("needs_attention").tone).toBe("danger");
    expect(attentionCategoryGlyph("progressing").tone).toBe("success");
    expect(attentionCategoryGlyph("strong").tone).toBe("primary");
    // Watching is not an alarm.
    expect(attentionCategoryGlyph("watch").tone).toBe("neutral");
    expect(attentionCategoryGlyph("insufficient_data").tone).toBe("muted");
  });

  it("draws a trend the same way for the class and for one student", () => {
    expect(learningTrendGlyph("improving")).toEqual({ icon: "trending-up-outline", tone: "success" });
    expect(learningTrendGlyph("declining")).toEqual({ icon: "trending-down-outline", tone: "danger" });
    expect(learningTrendGlyph("stable")).toEqual({ icon: "remove-outline", tone: "neutral" });
    // No trend, no mark — the sentence stands alone as it did before.
    expect(learningTrendGlyph("insufficient_data")).toBeNull();
  });

  it("marks intervention and assignment verdicts, and never a non-verdict", () => {
    expect(interventionEffectivenessGlyph("improved")?.tone).toBe("success");
    expect(interventionEffectivenessGlyph("worsened")?.tone).toBe("danger");
    expect(interventionEffectivenessGlyph("no_change")?.tone).toBe("neutral");
    expect(interventionEffectivenessGlyph("insufficient_data")).toBeNull();

    expect(assignmentEffectivenessGlyph("effective")?.tone).toBe("success");
    expect(assignmentEffectivenessGlyph("needs_follow_up")?.tone).toBe("danger");
    expect(assignmentEffectivenessGlyph("mixed")?.tone).toBe("neutral");
    expect(assignmentEffectivenessGlyph("insufficient_data")).toBeNull();
  });

  it("has no amber and no traffic light — every tone is a palette semantic", () => {
    const source = read("src/features/teacher/services/statusGlyphs.ts")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    expect(source).not.toMatch(/warning|amber|orange|yellow|#[0-9a-fA-F]{3,8}\b/);
    // Pure: pinned without React or the theme runtime.
    expect(source).not.toMatch(/from "react"|themeRuntime|@theme\/colors/);
  });
});

describe("the former emoji sites", () => {
  it.each(FORMER_EMOJI_SITES)("%s carries no status emoji and draws its state with StatusLabel", (file) => {
    const code = read(file)
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(STATUS_EMOJI);
    // The named-import list is not the point — that the screen draws its state
    // with the shared StatusLabel is (Phase 124 added statusToneColor beside it
    // so the attention card's accent bar reads from the same tone map).
    expect(code).toMatch(/import \{[^}]*\bStatusLabel\b[^}]*\} from "@components\/ui\/StatusLabel";/);
    expect(code).toContain("Glyph(");
  });

  it("keeps the words as the single accessible node — the glyph is decorative", () => {
    const label = read("src/components/ui/StatusLabel.tsx");
    expect(label).toContain("accessibilityElementsHidden");
    expect(label).toMatch(/<Text style=\{\[styles\.text, textStyle\]\}>\{children\}<\/Text>/);
    // Tones resolve through the theme's semantic colours, nothing invented.
    expect(label).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const token of ["colors.danger", "colors.success", "colors.primary", "colors.textSecondary", "colors.textTertiary"]) {
      expect(label).toContain(token);
    }
  });

  it("speaks the category on a priority row and the Turkish status on an assignment row", () => {
    const screen = read("src/features/teacher/screens/ClassPerformanceScreen.tsx");
    expect(screen).toContain(
      "accessibilityLabel={`${student.displayName}. ${attentionCategoryLabel(student.insight.category)}. ${student.insight.reasons[0] ?? \"\"}`}",
    );
    expect(screen).toContain("accessibilityLabel={`${assignmentItem.title}. ${assignmentStatusLabel(displayStatus)}`}");
    expect(screen).not.toContain("${assignmentItem.title}. ${displayStatus}");
    // The summary chip is one spoken unit: count and category together.
    expect(screen).toContain("accessibilityLabel={`${categoryCounts[category]} ${attentionCategoryLabel(category)}`}");
    // A hotspot row says whether its student chips are open.
    expect(screen).toContain("accessibilityState={{ expanded }}");
  });
});
