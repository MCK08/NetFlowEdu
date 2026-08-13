import {
  buildClassTopicHotspots,
  MAX_CLASS_TOPIC_HOTSPOTS,
  StudentTopics,
} from "../../src/features/teacher/services/classTopicInsights";
import { TopicInsight } from "../../src/features/study/services/learningInsights";

function topic(overrides: Partial<TopicInsight> = {}): TopicInsight {
  return {
    subject: "Matematik",
    topic: "Kesirler",
    struggledCount: 0,
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
