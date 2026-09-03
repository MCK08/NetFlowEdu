import {
  buildClassTopicHotspots,
  MAX_CLASS_TOPIC_HOTSPOTS,
  StudentTopics,
} from "../../src/features/teacher/services/classTopicInsights";
import { TopicInsight } from "../../src/features/study/services/learningInsights";
import { Question } from "@/types/question";

function topic(overrides: Partial<TopicInsight> = {}): TopicInsight {
  return {
    subject: "Matematik",
    topic: "Kesirler",
    struggledCount: 0,
    // Phase 41 — a legacy topic with no cumulative counters. null, never 0:
    // these fixtures exercise class hotspot ranking, which reads
    // struggledCount only, so "unknown" is the honest default here.
    struggledAttemptCount: null,
    masteredCount: 0,
    dueCount: 0,
    totalCount: 1,
    sampleQuestionId: "q1",
    masteryBand: "developing",
    recency: "recently_practiced",
    ...overrides,
  };
}

function student(studentUid: string, allTopics: TopicInsight[]): StudentTopics {
  return { studentUid, allTopics };
}

describe("buildClassTopicHotspots — empty / trivial", () => {
  it("returns an empty list for no students", () => {
    expect(buildClassTopicHotspots([])).toEqual([]);
  });

  it("returns an empty list when no student has struggled in any topic", () => {
    const students = [student("s1", [topic({ struggledCount: 0 })])];
    expect(buildClassTopicHotspots(students)).toEqual([]);
  });

  it("surfaces a topic with exactly one struggling student", () => {
    const students = [student("s1", [topic({ struggledCount: 1 })])];
    const hotspots = buildClassTopicHotspots(students);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]?.strugglingStudents).toBe(1);
    expect(hotspots[0]?.studentsWithAttempts).toBe(1);
  });
});

describe("buildClassTopicHotspots — many students, mixed outcomes", () => {
  it("counts distinct students correctly across a real class", () => {
    const students = [
      student("s1", [topic({ subject: "Matematik", topic: "Denklemler", struggledCount: 2, totalCount: 3 })]),
      student("s2", [topic({ subject: "Matematik", topic: "Denklemler", struggledCount: 1, totalCount: 2 })]),
      student("s3", [
        topic({ subject: "Matematik", topic: "Denklemler", struggledCount: 0, masteredCount: 2, totalCount: 2, masteryBand: "mastered" }),
      ]),
      student("s4", [topic({ subject: "Matematik", topic: "Denklemler", struggledCount: 0, dueCount: 1, totalCount: 1 })]),
    ];
    const hotspots = buildClassTopicHotspots(students);
    expect(hotspots).toHaveLength(1);
    const hotspot = hotspots[0]!;
    expect(hotspot.studentsWithAttempts).toBe(4);
    expect(hotspot.strugglingStudents).toBe(2); // s1, s2
    expect(hotspot.masteredStudents).toBe(1); // s3
    expect(hotspot.dueStudents).toBe(1); // s4
  });

  it("keeps separate topics under the same subject fully independent", () => {
    const students = [
      student("s1", [
        topic({ subject: "Matematik", topic: "Denklemler", struggledCount: 1 }),
        topic({ subject: "Matematik", topic: "Kesirler", struggledCount: 0 }),
      ]),
    ];
    const hotspots = buildClassTopicHotspots(students);
    expect(hotspots.map((h) => h.topic)).toEqual(["Denklemler"]);
  });

  it("ranks the topic with more struggling students first", () => {
    const students = [
      student("s1", [
        topic({ subject: "Matematik", topic: "Az Zorlanılan", struggledCount: 1 }),
        topic({ subject: "Fizik", topic: "Çok Zorlanılan", struggledCount: 1 }),
      ]),
      student("s2", [topic({ subject: "Fizik", topic: "Çok Zorlanılan", struggledCount: 1 })]),
      student("s3", [topic({ subject: "Fizik", topic: "Çok Zorlanılan", struggledCount: 1 })]),
    ];
    const hotspots = buildClassTopicHotspots(students);
    expect(hotspots[0]?.topic).toBe("Çok Zorlanılan");
    expect(hotspots[0]?.strugglingStudents).toBe(3);
  });
});

describe("buildClassTopicHotspots — legacy / unknown metadata", () => {
  it("excludes a topic bucket with an empty subject or topic (legacy/unresolved question)", () => {
    const students = [student("s1", [topic({ subject: "", topic: "", struggledCount: 5 })])];
    expect(buildClassTopicHotspots(students)).toEqual([]);
  });

  it("does not throw for a student with no topics at all", () => {
    const students = [student("s1", [])];
    expect(() => buildClassTopicHotspots(students)).not.toThrow();
    expect(buildClassTopicHotspots(students)).toEqual([]);
  });
});

describe("buildClassTopicHotspots — cap and robustness", () => {
  it("caps the returned list at MAX_CLASS_TOPIC_HOTSPOTS", () => {
    const students = [
      student(
        "s1",
        Array.from({ length: MAX_CLASS_TOPIC_HOTSPOTS + 5 }, (_, i) =>
          topic({ subject: "Matematik", topic: `Konu${i}`, struggledCount: 1 }),
        ),
      ),
    ];
    expect(buildClassTopicHotspots(students)).toHaveLength(MAX_CLASS_TOPIC_HOTSPOTS);
  });

  it("does not mutate the input array", () => {
    const students = [student("s1", [topic({ struggledCount: 1 })])];
    const copy = JSON.parse(JSON.stringify(students));
    buildClassTopicHotspots(students);
    expect(students).toEqual(copy);
  });

  it("is deterministic for the same input", () => {
    const students = [
      student("s1", [topic({ subject: "Matematik", topic: "Denklemler", struggledCount: 1 })]),
      student("s2", [topic({ subject: "Fizik", topic: "Kuvvet", struggledCount: 1 })]),
    ];
    const a = buildClassTopicHotspots(students);
    const b = buildClassTopicHotspots(students);
    expect(a).toEqual(b);
  });

  it("breaks a tie on struggling-student count by studentsWithAttempts, then alphabetically", () => {
    const students = [
      student("s1", [
        topic({ subject: "Matematik", topic: "B Konu", struggledCount: 1, totalCount: 1 }),
        topic({ subject: "Matematik", topic: "A Konu", struggledCount: 1, totalCount: 1 }),
      ]),
    ];
    const hotspots = buildClassTopicHotspots(students);
    expect(hotspots.map((h) => h.topic)).toEqual(["A Konu", "B Konu"]);
  });
});

// Phase 42 — class-level struggle EVENTS, not just how many people struggled.
//
// The gap: five students who each struggled once and five who each struggled
// eight times both produce strugglingStudents = 5 and were indistinguishable.
describe("buildClassTopicHotspots — struggled event totals", () => {
  function studentWith(uid: string, struggledCount: number, struggledAttemptCount: number | null) {
    return {
      studentUid: uid,
      allTopics: [topic({ struggledCount, struggledAttemptCount, totalCount: 1 })],
    };
  }

  it("sums real struggled events across students", () => {
    const hotspots = buildClassTopicHotspots([
      studentWith("a", 1, 8),
      studentWith("b", 1, 3),
    ]);
    expect(hotspots[0]?.strugglingStudents).toBe(2);
    expect(hotspots[0]?.struggledAttemptCount).toBe(11);
  });

  it("separates a class that struggled once each from one that struggled repeatedly", () => {
    const light = buildClassTopicHotspots([studentWith("a", 1, 1), studentWith("b", 1, 1)]);
    const heavy = buildClassTopicHotspots([studentWith("a", 1, 8), studentWith("b", 1, 8)]);
    // Same number of people affected...
    expect(light[0]?.strugglingStudents).toBe(heavy[0]?.strugglingStudents);
    // ...very different amount of struggling.
    expect(light[0]?.struggledAttemptCount).toBe(2);
    expect(heavy[0]?.struggledAttemptCount).toBe(16);
  });

  it("is null — never 0 — when no student has trustworthy history", () => {
    const hotspots = buildClassTopicHotspots([studentWith("a", 1, null), studentWith("b", 1, null)]);
    expect(hotspots[0]?.strugglingStudents).toBe(2);
    expect(hotspots[0]?.struggledAttemptCount).toBeNull();
  });

  it("ignores legacy students rather than diluting the total with zeros", () => {
    const hotspots = buildClassTopicHotspots([studentWith("a", 1, null), studentWith("b", 1, 6)]);
    expect(hotspots[0]?.struggledAttemptCount).toBe(6);
  });

  // The ranking contract: event counts are evidence, never a sort key.
  it("does NOT re-rank hotspots by event count", () => {
    const hotspots = buildClassTopicHotspots([
      // One student, a huge event count.
      { studentUid: "a", allTopics: [topic({ topic: "Az Kisi", struggledCount: 1, struggledAttemptCount: 99, totalCount: 1 })] },
      // Two students, a small event count — more PEOPLE affected.
      { studentUid: "b", allTopics: [topic({ topic: "Cok Kisi", struggledCount: 1, struggledAttemptCount: 1, totalCount: 1 })] },
      { studentUid: "c", allTopics: [topic({ topic: "Cok Kisi", struggledCount: 1, struggledAttemptCount: 1, totalCount: 1 })] },
    ]);
    // Still ordered by strugglingStudents descending, exactly as before.
    expect(hotspots[0]?.topic).toBe("Cok Kisi");
    expect(hotspots[1]?.topic).toBe("Az Kisi");
  });

  it("counts each student once even when they appear with multiple items in the topic", () => {
    const hotspots = buildClassTopicHotspots([
      {
        studentUid: "a",
        allTopics: [topic({ struggledCount: 2, struggledAttemptCount: 5, totalCount: 2 })],
      },
    ]);
    expect(hotspots[0]?.strugglingStudents).toBe(1);
    expect(hotspots[0]?.struggledAttemptCount).toBe(5);
  });

  it("is deterministic", () => {
    const students = [studentWith("a", 1, 4), studentWith("b", 1, 2)];
    expect(buildClassTopicHotspots(students)).toEqual(buildClassTopicHotspots(students));
  });
});

// Phase 43 — a hotspot reports the grade its questions agree on, so an
// intervention started from it opens the composer on the right grade
// instead of the taxonomy's first entry ("5").
describe("buildClassTopicHotspots — evidence-derived gradeLevel", () => {
  function question(id: string, overrides: Partial<Question> = {}): Question {
    return {
      id,
      ownerId: "teacher-1",
      organizationId: "org-1",
      visibility: "class",
      imageUrl: `https://example.com/${id}.jpg`,
      classId: "class-1",
      subject: "Matematik",
      topic: "Kesirler",
      gradeLevel: "12",
      description: null,
      posterRole: "teacher",
      createdAt: 0,
      likeCount: 0,
      commentCount: 0,
      answerCount: 0,
      choices: null,
      correctChoice: null,
      hints: [],
      ...overrides,
    };
  }

  const strugglingStudent = [student("s1", [topic({ struggledCount: 1 })])];

  it("reports the grade when every question in the topic agrees", () => {
    const hotspots = buildClassTopicHotspots(
      strugglingStudent,
      new Map([["q1", question("q1")], ["q2", question("q2")]]),
    );
    expect(hotspots[0]?.gradeLevel).toBe("12");
  });

  it("reports null for a mixed-grade topic rather than picking one", () => {
    const hotspots = buildClassTopicHotspots(
      strugglingStudent,
      new Map([
        ["q1", question("q1", { gradeLevel: "9" })],
        ["q2", question("q2", { gradeLevel: "12" })],
      ]),
    );
    expect(hotspots[0]?.gradeLevel).toBeNull();
  });

  it("reports null when no question metadata is supplied — every existing caller is unchanged", () => {
    expect(buildClassTopicHotspots(strugglingStudent)[0]?.gradeLevel).toBeNull();
  });

  it("ignores questions from OTHER topics when resolving the grade", () => {
    const hotspots = buildClassTopicHotspots(
      strugglingStudent,
      new Map([
        ["q1", question("q1", { topic: "Kesirler", gradeLevel: "12" })],
        ["q2", question("q2", { topic: "Türev", gradeLevel: "9" })],
      ]),
    );
    expect(hotspots[0]?.gradeLevel).toBe("12");
  });

  it("tolerates an unresolved question in the map", () => {
    const hotspots = buildClassTopicHotspots(
      strugglingStudent,
      new Map([["q1", question("q1")], ["missing", null]]),
    );
    expect(hotspots[0]?.gradeLevel).toBe("12");
  });

  it("does not change hotspot ranking", () => {
    const students = [
      student("s1", [
        topic({ subject: "Matematik", topic: "Az Kisi", struggledCount: 1 }),
        topic({ subject: "Fizik", topic: "Cok Kisi", struggledCount: 1 }),
      ]),
      student("s2", [topic({ subject: "Fizik", topic: "Cok Kisi", struggledCount: 1 })]),
    ];
    const withMeta = buildClassTopicHotspots(students, new Map([["q1", question("q1")]]));
    const withoutMeta = buildClassTopicHotspots(students);
    expect(withMeta.map((h) => h.topic)).toEqual(withoutMeta.map((h) => h.topic));
  });
});
