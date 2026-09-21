import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { channelsForRole } from "../../src/features/feed/services/feedChannels";

// Phase 116 — Akış, question-first.
//
// The feed's architecture was already right (Phase 109: one question per
// page, inline answering through the canonical engine, the open-ended path
// on AnswerScreen). What it looked like was not: the top of every page was
// two filled chips, the largest object on screen could be an empty grey
// image box, and "Sonraki" — the one thing a student does after every
// question — was the fourth of four identical pills, beside "Beğen".
//
// These tests pin the new priority and, more importantly, that the polish
// changed nothing beneath it: same ranking, same answer semantics, same
// saved-question model, same routes, no counts invented, no gamification.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PAGE = "src/features/feed/components/QuestionFeedPage.tsx";
const SCREEN = "src/features/feed/screens/FeedScreen.tsx";
const SCOPE = "src/features/feed/components/FeedScopeBar.tsx";
const MC = "src/features/questions/components/MultipleChoiceAnswer.tsx";

describe("§3 the question dominates its page", () => {
  it("names the question in two quiet lines instead of two filled chips", () => {
    const page = code(PAGE);
    expect(page).toContain("styles.subjectLine");
    expect(page).toContain("styles.factsLine");
    // The chips are gone, not restyled.
    expect(page).not.toContain("styles.tagQuiet");
  });

  it("builds the grade/type line from the document's own fields", () => {
    const page = code(PAGE);
    expect(page).toContain("question.gradeLevel.trim()");
    // The type is read from the same test that picks the answer UI, so the
    // label can never disagree with what is rendered below it.
    expect(page).toContain('isMultipleChoice ? "Çoktan seçmeli" : "Açık uçlu"');
  });

  it("collapses a failed image instead of holding 40% of the page empty", () => {
    const page = code(PAGE);
    expect(page).toContain("onError={() => setImageFailed(true)}");
    expect(page).toContain("styles.mediaFallback");
    expect(page).toContain("Görsel yüklenemedi");
  });
});

describe("§7 Sonraki is the page's one filled button", () => {
  it("is a PrimaryButton, not one of the secondary pills", () => {
    const page = code(PAGE);
    // No <Action> carries it any more — the pills are support only.
    expect(page).not.toMatch(/<Action[^>]*label="Sonraki"/);
    expect(page).not.toContain("arrow-down-circle-outline");
    expect(page).toMatch(/<PrimaryButton\s+label="Sonraki"/);
    // And it sits after the support row, not inside it.
    expect(page.indexOf('label="Sonraki"')).toBeGreaterThan(page.indexOf("<View style={styles.actions}>"));
  });

  it("still only appears when a next page exists, and still says what it does", () => {
    const page = code(PAGE);
    expect(page).toContain("{hasNext ? (");
    expect(page).toContain('accessibilityHint="Sonraki soruya geçer"');
  });

  it("does not replace paging — the pager is untouched", () => {
    const screen = code(SCREEN);
    // Same vertical pager, same snap, same page height.
    expect(screen).toContain("pagingEnabled");
    expect(screen).toContain("getItemLayout");
    expect(code(PAGE)).toContain("onNext");
  });
});

describe("§6 support stays secondary, and every action is real", () => {
  it("keeps Kaydet on the canonical saved-question model", () => {
    const page = code(PAGE);
    expect(page).toContain("useSavedQuestion(question, uid)");
    expect(page).toContain("onPress={toggleSaved}");
  });

  it("keeps Tartış on the existing question route", () => {
    const page = code(PAGE);
    expect(page).toContain('pathname: "/(student)/question/[questionId]"');
    expect(page).toContain("onPress={openDetail}");
  });

  it("keeps the hint ladder inline and authored — no generator, no AI claim", () => {
    const page = code(PAGE);
    expect(page).toContain("<QuestionHintLadder hints={question.hints} />");
    expect(code("src/features/questions/components/QuestionHintLadder.tsx")).not.toMatch(/Yapay zek|AI |generate/i);
  });

  it("prints only counts the document actually carries", () => {
    const page = code(PAGE);
    // Both are document fields; nothing is derived, estimated or invented.
    expect(page).toContain("count={question.commentCount}");
    expect(page).toContain("initialLikeCount: question.likeCount");
    expect(page).toContain("const hasCount = typeof count === \"number\" && count > 0;");
  });
});

describe("§5 the answer engine is untouched beneath the new option styling", () => {
  it("still records through the one canonical bridge", () => {
    const mc = code(MC);
    expect(mc).toContain("recordStudyOutcome(questionId, outcome, undefined, label)");
    expect(mc).toContain("mcResultToStudyOutcome(evaluateChoice(correctChoice, label))");
    expect(mc).toContain("shouldReportMcOutcome(questionId, isStudent)");
  });

  it("still refuses a second answer and still resolves feedback the same way", () => {
    const mc = code(MC);
    expect(mc).toContain("if (selected !== null) return;");
    expect(mc).toContain("guardRef.current.shouldProceed()");
    expect(mc).toContain("resolveChoiceFeedback(");
  });

  it("gives each option a badge, a 44pt target and a non-colour-only state", () => {
    const mc = read(MC);
    expect(mc).toContain("styles.optionLetterBadge");
    expect(mc).toContain("minHeight: minTouchTarget");
    expect(mc).toContain("accessibilityState={{ selected: isSelected, disabled: selected !== null }}");
    expect(mc).toContain("accessibilityLabel={`${label} şıkkı: ${text}`}");
  });

  it("keeps the result and the correct answer stated in words, not only colour", () => {
    const mc = read(MC);
    expect(mc).toContain("✓ Doğru");
    expect(mc).toContain("✕ Yanlış");
    expect(mc).toContain("Doğru cevap: {correctChoice}");
  });
});

describe("§2 the scope bar reaches the channels without inventing any", () => {
  it("offers exactly the role's canonical channels", () => {
    const student = channelsForRole("student").map((channel) => channel.id);
    expect(student).toEqual(["for_you", "discover", "my_classes", "struggles"]);
    expect(code(SCOPE)).toContain("channels.map");
  });

  it("writes the same channel state the filter sheet writes", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("onSelectChannel={setChannel}");
    expect(screen).toContain("onSelectChannel={setChannel}");
    // One state, one resolver — the sheet and the bar cannot disagree.
    expect(screen).toContain("const activeChannel = resolveChannelForRole(channel, role);");
  });

  it("separates channels from subjects for a screen reader", () => {
    const bar = read(SCOPE);
    expect(bar).toContain('accessibilityRole="tablist"');
    expect(bar).toContain("accessibilityState={{ selected: isActive }}");
    expect(bar).toContain("accessibilityLabel={subject ? `${subject} soruları` : \"Tüm dersler\"}");
    expect(bar).toContain("minHeight: minTouchTarget");
  });

  it("replaced the subjects-only bar rather than keeping both", () => {
    expect(existsSync(join(ROOT, "src/features/feed/components/SubjectPillBar.tsx"))).toBe(false);
  });
});

describe("§10 the largest text size", () => {
  // Both found on the simulator at the largest accessibility size, with a
  // clean relaunch — not dismissed as device behaviour.
  it("stops the meta and the author sharing one line once text is scaled", () => {
    const page = read(PAGE);
    expect(page).toContain("const STACK_ABOVE_FONT_SCALE = 1.3;");
    expect(page).toContain("const stackedMeta = fontScale > STACK_ABOVE_FONT_SCALE;");
    expect(page).toContain("stackedMeta ? styles.metaRowStacked : null");
    // The author's name may take a second line rather than truncating.
    expect(page).toContain("numberOfLines={stackedMeta ? 2 : 1}");
  });

  it("lets the option letter badge grow with the letter it shows", () => {
    const mc = read(MC);
    // A fixed 28pt circle clipped the glyph at a large text size.
    expect(mc).not.toMatch(/optionLetterBadge:\s*\{[^}]*\bwidth: 28,/);
    expect(mc).toMatch(/optionLetterBadge:\s*\{[^}]*minWidth: 28,/);
    expect(mc).toMatch(/optionLetterBadge:\s*\{[^}]*minHeight: 28,/);
  });

  it("keeps the question text unbounded so it wraps instead of clipping", () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/styles\.caption}\s*numberOfLines/);
    expect(page).not.toMatch(/styles\.subjectLine} numberOfLines=\{1\}/);
    expect(read(MC)).not.toMatch(/styles\.optionText}\s*numberOfLines/);
  });
});

describe("§4 the locks", () => {
  it("leaves Phase 109 ranking and composition exactly as they were", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("buildQuestionFeedRanking({");
    expect(screen).toContain("composeFeedOrder(ranked, signals)");
    expect(screen).toContain("withAssignmentSignals(signalsByQuestionId, assignedQuestionIds(assignmentCards))");
  });

  it("keeps the open-ended path on the existing AnswerScreen", () => {
    const page = code(PAGE);
    expect(page).toContain('pathname: "/(student)/answer/[questionId]"');
    expect(page).toContain('label="Cevapla"');
    // No inline MC UI is faked for a question without choices.
    expect(page).toContain("hasMultipleChoice(question.choices) ? question.choices : null");
  });

  it("keeps the student tabs and their order", () => {
    const titles = [...read("app/(student)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
  });

  it("introduces no score, rank, popularity or community ordering", () => {
    for (const file of [PAGE, SCREEN, SCOPE, MC]) {
      expect(code(file)).not.toMatch(
        /totalPoints|weeklyPoints|\bPuan\b|\bXP\b|leaderboard|popularity|liderlik|percentile|rozet/i,
      );
    }
    // Phase 108's community signal stays a sentence, never an ordering key.
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/sort.*community|community.*sort/i);
  });

  it("uses theme tokens in both modes", () => {
    for (const file of [PAGE, SCOPE, MC]) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|"white"|"black"/);
      expect(read(file)).toContain("themedStyles");
    }
  });
});
