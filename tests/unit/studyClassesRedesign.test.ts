import { readFileSync } from "fs";
import { join } from "path";

// Phase 106 — the Çalış and Sınıflarım redesign, pinned by SHAPE.
//
// The visual reference for this phase depicted several things the product
// does not have (member rosters for students, class statistics, an activity
// feed, invitations, "last seen"). These tests pin what WAS adopted — the
// hierarchy, the tokens, the accessibility ownership, the preserved
// destinations — and, just as deliberately, that none of the invented
// capabilities crept in for the sake of looking like the picture.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

function styleBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^\\s+${name}:\\s*\\{([^{}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

const STUDY = "src/features/study/screens/StudyScreen.tsx";
const NEXT_ACTION = "src/features/study/components/NextActionSection.tsx";
const PLAN = "src/features/study/components/DailyPracticePlanSection.tsx";
const GOAL = "src/features/study/components/StudyProgressCard.tsx";
const GOAL_EDITOR = "src/features/study/components/DailyGoalEditor.tsx";
const ASSIGNED = "src/features/study/components/AssignedWorkSection.tsx";
const WEAK = "src/features/study/components/WeakTopicsSection.tsx";
const SUBJECTS = "src/features/study/components/SubjectBreakdownSection.tsx";
const STORY_TILE = "src/features/learningStory/components/LearningStoryEntryCard.tsx";
const ATLAS_TILE = "src/features/study/components/LearningAtlasEntryCard.tsx";
const CLASSES = "src/features/classes/screens/StudentClassesScreen.tsx";
const CLASS_CARD = "src/features/classes/components/StudentClassCard.tsx";
const CLASS_DETAIL = "src/features/classes/screens/StudentClassDetailScreen.tsx";
const QUESTION_TILE = "src/features/classes/components/ClassQuestionTile.tsx";

const STATUS_EMOJI = /[\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{26AA}\u{1F31F}\u{1F4C8}\u{1F4C9}\u{27A1}\u{26A0}\u{2705}\u{1F525}\u{1F680}\u{1F331}\u{1F499}]/u;

const ALL_TOUCHED = [
  STUDY, NEXT_ACTION, PLAN, GOAL, GOAL_EDITOR, ASSIGNED, WEAK, SUBJECTS, STORY_TILE, ATLAS_TILE,
  CLASSES, CLASS_CARD, CLASS_DETAIL, QUESTION_TILE, "src/components/ui/Card.tsx",
];

describe("design language — tokens, no emoji, no invented colour", () => {
  it.each(ALL_TOUCHED)("%s paints only with theme tokens and carries no emoji", (file) => {
    const source = code(file);
    expect(source).not.toMatch(STATUS_EMOJI);
    // No literal colour on a themed surface. The one pinned surface (the
    // class feed entry) names the dark palette and the immersive constants
    // by token, never by hex.
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|"white"|"black"/);
    // No hand-written text metrics: every text style spreads a role — with
    // the two Wave A locks named: the Sınıflarım title stays 26pt and the
    // leave-class label stays a deliberately quieter 14/600.
    const literals = source.match(/fontSize:\s*\d+/g) ?? [];
    const allowed: Record<string, string[]> = {
      [CLASSES]: ["fontSize: 26"],
      [CLASS_DETAIL]: ["fontSize: 14"],
    };
    expect(literals).toEqual(allowed[file] ?? []);
  });

  it("Card gains an outlined variant that uses the divider token at one point, not a hairline", () => {
    const card = code("src/components/ui/Card.tsx");
    expect(card).toContain('variant?: "flat" | "elevated" | "outlined"');
    expect(styleBlock(card, "outlined")).toContain("borderWidth: 1");
    expect(styleBlock(card, "outlined")).toContain("borderColor: colors.divider");
  });
});

describe("Çalış — action before data", () => {
  it("keeps the workspace's order: one action, today's plan, unresolved questions, practice, gaps, strengths, progress, goal", () => {
    // Phase 109 — Çalış is one scroll. The action still comes before the
    // data; the data is now inline (plan rows, archive rows, topic rows)
    // rather than tiles that open other screens.
    const source = read(STUDY);
    const body = source.slice(source.indexOf("return ("));
    const order = [
      "FOCUS_TITLE}",
      "<PrimaryButton",
      "TODAY_TITLE}",
      "<PlanStepRow",
      "UNRESOLVED_TITLE}",
      "<ArchiveEntryRow",
      // Phase 117 — the section header here was the first tile's own
      // words repeated; the tiles label themselves now.
      "PRACTICE_TILE_FILTER}",
      "<PracticeLauncher",
      "STRUGGLE_TITLE}",
      "STRENGTHS_TITLE}",
      "PROGRESS_TITLE}",
      "GOAL_TITLE}",
      "<DailyGoalEditor",
    ].map((marker) => body.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the next action is the one blue-tinted card and keeps its routing contract", () => {
    const source = code(NEXT_ACTION);
    expect(styleBlock(source, "card")).toContain("backgroundColor: colors.primaryMuted");
    expect(source).toContain("onStart: () => void;");
    expect(source).toContain("nextActionCopy(action, Date.now())");
    // The mark is decorative; the row speaks label, title and detail.
    expect(source).toContain("accessibilityLabel={`${copy.label}. ${copy.title}. ${copy.detail}.`}");
    expect(source).toMatch(/<Ionicons name=\{icon\}[^>]*accessibilityElementsHidden/);
  });

  it("the story and atlas entries survive as quiet text rows at the foot of the workspace", () => {
    // Phase 109 — the two insight tiles left the top of Çalış (the question
    // is the product's hero now); their destinations did not.
    const study = read(STUDY);
    expect(study).toContain('goTo("/(student)/learning-story")');
    expect(study).toContain("goTo(ROUTES.studentLearningAtlas)");
    expect(study).not.toContain("<LearningStoryEntryCard");
    expect(study).not.toContain("<LearningAtlasEntryCard");
    for (const tile of [STORY_TILE, ATLAS_TILE]) {
      const source = code(tile);
      expect(source).toContain('<Card variant="outlined"');
      expect(source).toContain('accessibilityRole="button"');
    }
  });

  it("assigned work is one grouped list whose rows speak status in words", () => {
    const source = code(ASSIGNED);
    expect(source).toContain('<Card variant="outlined"');
    for (const word of ["Tamamlandı", "Süresi geçti", "Devam ediyor", "Başlamadı"]) {
      expect(source).toContain(word);
    }
    // The row is the button and opens the same assignment; completed work
    // stays, dimmed.
    expect(source).toContain("onPress={() => onOpen(assignment.id)}");
    expect(styleBlock(source, "rowCompleted")).toContain("opacity: 0.6");
    expect(source).toContain("accessibilityLabel={`${assignment.title}. ${assignment.subject}, ${assignment.topic}. ${detailLine}.`}");
    // No fixed-height trap: rows grow with their text.
    expect(styleBlock(source, "row")).not.toMatch(/\bheight:/);
    expect(styleBlock(source, "row")).toContain("minHeight: minTouchTarget");
  });

  it("Bugünkü Plan keeps its rows, gains a real progress bar, and still starts via the caller", () => {
    const source = code(PLAN);
    expect(source).toContain('accessibilityRole="progressbar"');
    expect(source).toContain("accessibilityValue={{ min: 0, max: plan.dailyGoal, now: plan.reviewedToday }}");
    expect(source).toContain('label="Çalışmaya Başla"');
    expect(source).toContain("const handleStart = plan.dueCount > 0 || plan.planItems.length > 0 ? onStart : undefined;");
    for (const row of ["Önce Tekrar Et", "Güçlendir", "Devam Et"]) expect(source).toContain(row);
  });

  it("the goal editor is the workspace's last group, still a navigation row rather than a button", () => {
    const goal = code(GOAL);
    expect(goal).toContain("children?: ReactNode;");
    expect(goal).toContain("{children ? <View style={styles.footer}>{children}</View> : null}");
    const study = read(STUDY);
    // Phase 109 — the goal sits in the compact bottom group, not in a card
    // above the breakdown; the editor itself is unchanged.
    expect(study).toContain("<DailyGoalEditor currentGoal={summary.dailyGoal} onSaved={refresh} />");
    expect(study).not.toContain("<StudyProgressCard");
    const editor = code(GOAL_EDITOR);
    // A navigation row, not a button competing with the one action.
    expect(editor).toContain("<Text style={styles.triggerText}>Hedefi değiştir</Text>");
    expect(editor).toContain('name="chevron-forward"');
    expect(editor).not.toMatch(/<PrimaryButton[^>]*label="Hedefi değiştir"/);
    expect(styleBlock(editor, "trigger")).toContain("minHeight: minTouchTarget");
  });

  it("struggling topics are grouped rows with the real count as a quiet badge, not a red card", () => {
    const source = code(WEAK);
    expect(source).toContain('<Card variant="outlined"');
    expect(source).toContain('<Badge label={struggleLabel(topic)} variant="danger" />');
    expect(source).not.toMatch(/backgroundColor: colors\.danger/);
    expect(source).toContain("kez zorlandın");
    expect(source).toContain("soruda zorlandın");
  });

  it("subject rows say their counts with a mark and a word, never colour alone", () => {
    const source = code(SUBJECTS);
    expect(source).toContain('<StatusLabel icon="time-outline" tone="danger"');
    expect(source).toContain('<StatusLabel icon="checkmark-circle-outline" tone="success"');
    expect(source).toContain("tekrar gerekiyor");
    expect(source).toContain("öğrenildi");
    // Still counts, never a percentage.
    expect(source).not.toMatch(/%\$\{|\$\{[^}]*\}%/);
  });
});

describe("Sınıflarım — real sections, real data", () => {
  it("splits the list by the class document's own status and derives its subtitle from it", () => {
    const source = code(CLASSES);
    expect(source).toContain('room.status === "archived"');
    expect(source).toContain('"Aktif Sınıflarım"');
    expect(source).toContain('"Geçmiş Sınıflar"');
    expect(source).toContain("function subtitleFor(");
    // Nothing fabricated: no activity, no last-seen, no invitations.
    expect(source).not.toMatch(/son (aktif|görülme)|davet|Çevrimiçi|etkinlik/i);
    // The primary action and the notification affordance stay.
    expect(source).toContain('label="Sınıfa Katıl"');
    expect(source).toContain("<NotificationBellButton");
    // StudentClasses title stays 26pt (Wave A lock).
    expect(styleBlock(read(CLASSES), "title")).toContain("fontSize: 26");
  });

  it("the class row shows only what the class document holds", () => {
    const source = code(CLASS_CARD);
    expect(source).toContain("classRoom.memberCount");
    expect(source).toContain('<Badge label="Arşivlendi" variant="neutral" />');
    expect(source).not.toMatch(/teacherName|lastActive|online|Çevrimiçi/);
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toMatch(/<Ionicons name="chevron-forward"[^>]*accessibilityElementsHidden/);
  });
});

describe("class detail — hierarchy from the reference, capabilities from the product", () => {
  it("hero, balanced pair, feed entry, questions, leave — in that order", () => {
    const source = read(CLASS_DETAIL);
    const header = source.slice(source.indexOf("ListHeaderComponent="), source.indexOf("ListFooterComponent="));
    const order = [
      "<AppBackButton",
      '<Avatar displayName={classRoom.name} size="xl" />',
      "{classRoom.memberCount} üye",
      'accessibilityLabel="Sınıf sohbetini aç"',
      'accessibilityLabel="Soru paylaş"',
      'accessibilityLabel="Soru akışına gir"',
      "Sınıf Soruları",
    ].map((marker) => header.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const footer = source.slice(source.indexOf("ListFooterComponent="), source.indexOf("<ImageSourcePicker"));
    expect(footer).toContain("Sınıftan Ayrıl");
    expect(footer).toContain("onPress={confirmLeave}");
  });

  it("the two quick actions are a balanced pair that stacks at the accessibility text sizes", () => {
    const source = code(CLASS_DETAIL);
    expect(source).toContain("const stackedActions = fontScale >= stackAtFontScale;");
    expect(source).toContain("<View style={stackedActions ? styles.actionsStacked : styles.actions}>");
    expect(styleBlock(source, "actions")).toContain('flexDirection: "row"');
    for (const name of ["chatButton", "shareButton"]) {
      const block = styleBlock(source, name);
      expect(block).toContain("flex: 1");
      expect(block).toContain("minHeight: minTouchTarget");
      expect(block).not.toMatch(/\bheight:/);
    }
    // Share still reports busy while uploading.
    expect(source).toContain("accessibilityState={{ busy: isUploading, disabled: isUploading }}");
  });

  it("the feed entry stays the pinned dark surface, not a second filled CTA", () => {
    const source = code(CLASS_DETAIL);
    expect(styleBlock(source, "feedButton")).toContain(
      'getActiveTheme() === "dark" ? colors.surface : darkColors.background',
    );
    expect(source).toContain("Sınıfın sorularını akışta çöz");
    expect(source).not.toMatch(/feedButton:[^}]*backgroundColor: colors\.primary/);
  });

  it("adopts no capability the student does not have: no tabs, no roster, no stats, no invites", () => {
    const source = code(CLASS_DETAIL);
    expect(source).not.toMatch(/Üyeler|İstatistikler|Çalışmalar\b|Davet|getClassMembers|ClassMemberRow/);
    expect(source).not.toMatch(/accessibilityRole="tab"/);
    // The status word comes from the document, both values named.
    expect(source).toContain('isArchived ? "Arşivlendi" : "Aktif"');
  });

  it("question previews show the document's real content and nothing else", () => {
    const source = code(QUESTION_TILE);
    for (const field of ["question.imageUrl", "question.posterRole", "question.subject", "question.topic", "question.likeCount", "question.commentCount"]) {
      expect(source).toContain(field);
    }
    expect(source).toContain('pathname: "/(student)/question/[questionId]"');
    // One accessible node per tile; the marks inside are silent.
    expect(source).toContain("accessibilityLabel={spoken}");
    const icons = source.match(/<Ionicons\b[\s\S]*?\/>/g) ?? [];
    expect(icons.length).toBe(2);
    for (const icon of icons) expect(icon).toContain("accessibilityElementsHidden");
    // Two columns, sized from the real window.
    const detail = code(CLASS_DETAIL);
    expect(detail).toContain("const GRID_COLUMNS = 2;");
    expect(detail).toContain("const tileWidth = (width - spacing.lg * 2 - GRID_GAP) / GRID_COLUMNS;");
    expect(detail).not.toContain("QuestionGridItem");
  });
});
