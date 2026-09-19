import { readFileSync } from "fs";
import { join } from "path";

import type { Assignment } from "../../src/features/assignments/domain/assignmentTypes";
import {
  buildClassActivity,
  buildClassmates,
  CLASS_ACTIVITY_LIMIT,
  classActivitySentence,
  classPulseFacts,
  classPulseWeekKey,
  MIN_PULSE_PARTICIPANTS,
  otherStudentCount,
  parseClassPulse,
} from "../../src/features/classes/services/classSocial";
import { classPulseWeek } from "../../functions/src/classes/classPulse";
import { NOTIFICATION_TYPES as CLIENT_TYPES } from "../../src/types/notification";
import { NOTIFICATION_TYPES as SERVER_TYPES } from "../../functions/src/notifications/notificationTypes";
import { presentNotification } from "../../src/features/notifications/services/notificationPresentation";
import type { ClassMember } from "../../src/types/class";
import type { NotificationRecord } from "../../src/types/notification";
import type { Question } from "../../src/types/question";

// Phase 110 — the safe class social layer: classmates, class activity, one
// "Tebrik Et", and the class's weekly collective progress. Backend behaviour
// (rules, the kudos callable, the pulse trigger) is pinned by the emulator
// suites in tests/integration; this file pins the client model and the
// product's hard locks: no ranking, no popularity, no private data.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CLASS = "class-a";
const ME = "me";
const T0 = Date.UTC(2026, 8, 16, 7, 0, 0);

const member = (uid: string, role: "student" | "teacher", name: string, joinedAt = T0 - 10_000): ClassMember => ({
  uid, role, joinedAt, displayName: name, username: null, photoURL: null,
});

const MEMBERS: ClassMember[] = [
  member("teacher", "teacher", "Zeynep Hoca"),
  member(ME, "student", "Deniz"),
  member("ayse", "student", "Ayşe", T0 - 5_000),
  member("can", "student", "Can", T0 - 1_000),
];

function question(id: string, ownerId: string, createdAt: number, over: Partial<Question> = {}): Question {
  return {
    id, ownerId, organizationId: null, visibility: "class", imageUrl: "", classId: CLASS,
    subject: "Matematik", topic: "Denklemler", gradeLevel: "8", description: null, posterRole: "student",
    createdAt, likeCount: 0, commentCount: 0, answerCount: 0, choices: null, correctChoice: null,
    hints: [], choiceFeedback: null, ...over,
  };
}

function assignment(id: string, createdAt: number, over: Partial<Assignment> = {}): Assignment {
  return {
    id, classId: CLASS, organizationId: null, teacherId: "teacher", title: "Denklem Tekrarı", description: null,
    subject: "Matematik", topic: "Denklemler", gradeLevel: "8", targetStudentIds: [ME], questionIds: ["q"],
    targetCount: 1, dueAt: null, status: "published", createdAt, interventionOf: null,
    ...over,
  } as Assignment;
}

const activity = (questions: Question[] = [], assignments: Assignment[] = [], members = MEMBERS) =>
  buildClassActivity({ classId: CLASS, currentUid: ME, members, questions, assignments });

describe("§31 class activity — only real, class-scoped events", () => {
  it("renders a classmate's shared question, named, and offers congratulation", () => {
    const [event] = activity([question("q1", "ayse", T0)]).filter((e) => e.kind === "question_shared");
    expect(event).toMatchObject({ kind: "question_shared", actorName: "Ayşe", questionId: "q1", canCongratulate: true });
    expect(classActivitySentence(event!)).toBe("Ayşe sınıfta bir soru paylaştı.");
  });

  it("never offers congratulation on one's own, a teacher's, or a departed student's question", () => {
    const events = activity([
      question("mine", ME, T0),
      question("teachers", "teacher", T0 + 1, { posterRole: "teacher" }),
      question("gone", "left-student", T0 + 2),
    ]).filter((e) => e.kind === "question_shared");
    expect(events.every((e) => !e.canCongratulate)).toBe(true);
    expect(classActivitySentence(events.find((e) => e.questionId === "mine")!)).toBe("Sınıfta bir soru paylaştın.");
    expect(events.find((e) => e.questionId === "gone")!.actorName).toBe("Bir sınıf arkadaşın");
  });

  it("hides another class's records and anything that is not a class question", () => {
    const events = activity(
      [question("other", "ayse", T0, { classId: "class-b" }), question("public", "ayse", T0, { visibility: "public", classId: null })],
      [assignment("a-other", T0, { classId: "class-b" })],
    );
    expect(events.some((e) => e.questionId === "other" || e.questionId === "public" || e.assignmentId === "a-other")).toBe(false);
  });

  it("links a posted assignment, and never shows an intervention or a draft", () => {
    const events = activity([], [
      assignment("a1", T0),
      assignment("support", T0 + 1, { interventionOf: { subject: "Matematik", topic: "Denklemler" } }),
      assignment("draft", T0 + 2, { status: "draft" }),
    ]).filter((e) => e.kind === "assignment_posted");
    expect(events.map((e) => e.assignmentId)).toEqual(["a1"]);
    expect(classActivitySentence(events[0]!)).toBe("Yeni çalışma atandı: Denklem Tekrarı");
  });

  it("ignores malformed records safely instead of inventing a time", () => {
    const events = activity([question("bad", "ayse", Number.NaN)], [assignment("untitled", T0, { title: "  " })]);
    expect(events.some((e) => e.questionId === "bad" || e.assignmentId === "untitled")).toBe(false);
  });

  it("is ordered by time, newest first, and bounded", () => {
    const many = Array.from({ length: 12 }, (_, i) => question(`q${i}`, "ayse", T0 + i * 1000));
    const events = activity(many, [], [member(ME, "student", "Deniz"), member("ayse", "student", "Ayşe")]);
    expect(events).toHaveLength(CLASS_ACTIVITY_LIMIT);
    const times = events.map((e) => e.occurredAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("reports a join of a classmate, not of the student themselves, and has an empty state", () => {
    const joins = activity().filter((e) => e.kind === "member_joined");
    expect(joins.map((e) => e.actorName).sort()).toEqual(["Ayşe", "Can"]);
    expect(activity([], [], [member(ME, "student", "Deniz")])).toEqual([]);
    expect(read("src/features/classes/components/ClassActivitySection.tsx")).toContain(
      "Sınıf etkinliği başladığında burada göreceksin.",
    );
  });

  it("never publishes individual assignment completion", () => {
    const code = strip(read("src/features/classes/services/classSocial.ts"));
    expect(code).not.toMatch(/submission|completed|tamamladı|getAssignmentSubmissions|getMySubmission/i);
  });
});

describe("§6 classmates — safe identity, neutral order", () => {
  const mates = buildClassmates(MEMBERS, ME);

  it("lists the teacher first, then everyone alphabetically — an order that ranks no one", () => {
    expect(mates.map((m) => m.name)).toEqual(["Zeynep Hoca", "Ayşe", "Can", "Deniz"]);
    expect(mates.find((m) => m.uid === ME)?.isSelf).toBe(true);
    expect(otherStudentCount(mates)).toBe(2);
  });

  it("carries public identity only — nothing about performance, progress or contact", () => {
    expect(Object.keys(mates[0]!).sort()).toEqual(["isSelf", "joinedAt", "name", "photoURL", "role", "uid", "username"]);
  });

  it("never renders an email, a uid or a statistic in the classmate UI", () => {
    for (const file of [
      "src/features/classes/screens/ClassmatesScreen.tsx",
      "src/features/classes/components/ClassmatesPreview.tsx",
    ]) {
      const code = strip(read(file));
      expect(code).not.toMatch(/\bemail\b|@example/i);
      // A uid may key a React row (key / keyExtractor) — it must never be the
      // CONTENT of a Text that a person reads.
      expect(code).not.toMatch(/<Text[^>]*>[^<]*\{[^}]*\buid\b[^}]*\}/);
      expect(code).not.toMatch(/successRate|solvedCount|streak|accuracy|points/i);
    }
  });
});

describe("§32 class pulse — collective, and silent when it would identify someone", () => {
  it("asks for the SAME weekly document the server writes (Türkiye week, Monday start)", () => {
    const samples = [
      T0,
      Date.UTC(2026, 8, 13, 20, 59, 0), // Sun 23:59 TR — still the week of 7 Sep
      Date.UTC(2026, 8, 13, 21, 0, 0), //  Mon 00:00 TR — week of 14 Sep
      Date.UTC(2026, 11, 31, 22, 30, 0), // New Year, across a year boundary
      Date.UTC(2027, 1, 28, 12, 0, 0),
    ];
    for (const timestamp of samples) expect(classPulseWeekKey(timestamp)).toBe(classPulseWeek(timestamp).weekKey);
    expect(classPulseWeekKey(Date.UTC(2026, 8, 13, 20, 59, 0))).toBe("2026-09-07");
    expect(classPulseWeekKey(Date.UTC(2026, 8, 13, 21, 0, 0))).toBe("2026-09-14");
  });

  it("stays silent below the participant threshold", () => {
    expect(MIN_PULSE_PARTICIPANTS).toBeGreaterThanOrEqual(3);
    expect(classPulseFacts({ outcomeCount: 20, solvedCount: 14, participantCount: 2 })).toBeNull();
    expect(classPulseFacts(null)).toBeNull();
  });

  it("speaks for the class as a whole, and never of a person", () => {
    const facts = classPulseFacts({ outcomeCount: 40, solvedCount: 25, participantCount: 6 });
    expect(facts).toEqual(["6 öğrenci sınıf sorularıyla çalıştı", "Sınıf sorularında 25 çözüm kaydedildi"]);
  });

  it("parses defensively and never turns garbage into a claim", () => {
    expect(parseClassPulse({ participantCount: "çok", solvedCount: -3 })).toEqual({
      outcomeCount: 0, solvedCount: 0, participantCount: 0,
    });
    expect(parseClassPulse(null)).toBeNull();
  });
});

describe("§30 kudos — one gesture, no counts", () => {
  it("sends only the target; the server decides who sent it and to whom", () => {
    const service = strip(read("src/features/classes/services/classSocialService.ts"));
    expect(service).toContain("callable({ classId, questionId })");
    expect(service).not.toMatch(/senderId|recipientId|actorId/);
  });

  it("shows the sender's own state — 'Tebrik edildi' — and never a number", () => {
    const button = strip(read("src/features/classes/components/KudosButton.tsx"));
    expect(button).toContain('"Tebrik edildi"');
    expect(button).toContain('"Tebrik Et"');
    expect(button).toContain("accessibilityState={{ disabled: isSent || isPending, busy: isPending, selected: isSent }}");
    expect(button).not.toMatch(/count|\{\s*\d+\s*\}|toLocaleString/i);
  });

  it("reaches the recipient through the existing inbox, on both sides of the wire", () => {
    expect(CLIENT_TYPES).toContain("class_kudos_received");
    expect([...CLIENT_TYPES]).toEqual([...SERVER_TYPES]);
    const shown = presentNotification({
      id: "n", recipientId: ME, actorId: "ayse", actorDisplayName: "Ayşe", actorUsername: null, actorPhotoURL: null,
      type: "class_kudos_received", entityType: "question", entityId: "q1", parentEntityId: null, classId: CLASS,
      messagePreview: "8-A", createdAt: T0, readAt: null, isRead: false,
    } as NotificationRecord);
    expect(shown.title).toBe("Ayşe seni tebrik etti");
    expect(`${shown.title} ${shown.secondaryText}`).not.toMatch(/\d/);
  });
});

describe("§14/§16 privacy — no path to another student's private data", () => {
  it("the social layer never reads study data, analytics or someone else's records", () => {
    for (const file of [
      "src/features/classes/services/classSocial.ts",
      "src/features/classes/services/classSocialService.ts",
      "src/features/classes/hooks/useClassSocial.ts",
      "src/features/classes/hooks/useClassmates.ts",
    ]) {
      const code = strip(read(file));
      expect(code).not.toMatch(/studyItems|studyEvents|learningEvents|studentAnalytics|studentPerformance/);
      // No teacher-intervention or analytics MODULE is imported. (The activity
      // model reads assignment.interventionOf only to EXCLUDE such assignments
      // — pinned by the "never shows an intervention" test above.)
      const imports = code.match(/from "[^"]+"/g) ?? [];
      for (const specifier of imports) expect(specifier).not.toMatch(/intervention|effectiveness|features\/teacher/);
    }
    expect(strip(read("src/features/classes/services/classSocialService.ts"))).toContain(
      'collection(db, "users", uid, "sentKudos")',
    );
  });

  it("rules: classmates read their own class's rows; kudos and pulse are server-written only", () => {
    const rules = read("firestore.rules");
    const members = rules.slice(rules.indexOf("match /classes/{classId}/members/{memberUid} {"));
    expect(members.slice(0, 400)).toMatch(/isOwner\(memberUid\)\s*\|\|\s*isClassMember\(classId\)/);
    expect(rules).toMatch(/match \/users\/\{uid\}\/sentKudos\/\{kudosId\} \{\s*allow read: if isOwner\(uid\);\s*allow write: if false;/);
    expect(rules).toMatch(/match \/classes\/\{classId\}\/pulse\/\{weekKey\} \{[\s\S]*?allow write: if false;/);
  });
});

describe("§33 structural locks", () => {
  const NEW_UI = [
    "src/features/classes/components/ClassSocialSections.tsx",
    "src/features/classes/components/ClassmatesPreview.tsx",
    "src/features/classes/components/ClassPulseCard.tsx",
    "src/features/classes/components/ClassActivitySection.tsx",
    "src/features/classes/components/KudosButton.tsx",
    "src/features/classes/screens/ClassmatesScreen.tsx",
  ];
  const NEW_LOGIC = [
    "src/features/classes/services/classSocial.ts",
    "src/features/classes/services/classSocialService.ts",
    "functions/src/classes/sendClassKudos.ts",
    "functions/src/classes/classPulse.ts",
  ];

  it("keeps the bottom tabs exactly Akış / Çalış / Sınıf / Profil", () => {
    const titles = [...read("app/(student)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
  });

  it("contains no leaderboard, ranking, percentile or 'best student' concept", () => {
    for (const file of [...NEW_UI, ...NEW_LOGIC]) {
      const code = strip(read(file)).toLocaleLowerCase("tr");
      expect(code).not.toMatch(/liderlik|sıralama|ranking|leaderboard|top student|en iyi öğrenci|en aktif|percentile|yüzdelik|podium/);
    }
  });

  it("uses tokens only — no raw hex or rgba — and no emoji in the new UI", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const file of NEW_UI) {
      const code = strip(read(file));
      expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
      expect(code).not.toMatch(emoji);
    }
  });

  it("gives text no fixed height, and every tap target at least 44pt", () => {
    for (const file of NEW_UI) {
      const code = strip(read(file));
      // Heights appear only on the fixed-size icon tiles, never on text styles.
      const textStyles = code.match(/\b(title|name|sentence|when|label|factText|empty|muted|username|tag|subtitle):\s*\{[^}]*\}/g) ?? [];
      for (const style of textStyles) expect(style).not.toMatch(/\bheight:/);
    }
    for (const file of ["src/features/classes/components/KudosButton.tsx", "src/features/classes/components/ClassActivitySection.tsx", "src/features/classes/components/ClassmatesPreview.tsx"]) {
      expect(read(file)).toContain("minHeight: minTouchTarget");
    }
  });

  it("leaves Akış and Çalış untouched by the social layer", () => {
    for (const file of ["src/features/feed/screens/FeedScreen.tsx", "src/features/study/screens/StudyScreen.tsx"]) {
      expect(read(file)).not.toMatch(/ClassSocialSections|KudosButton|ClassPulseCard|classSocial/);
    }
  });
});
