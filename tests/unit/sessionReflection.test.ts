// Phase 66 — the session receipt and the reflection built from it.
//
// The idempotency block matters most: the session count sits beside a
// server-side counter that is already exactly-once, and a local receipt that
// double-counted a replayed callback would contradict it on screen.

import {
  appendSessionReceipt,
  buildSessionReflection,
  MAX_SESSION_MOMENTS,
  MIN_MOMENT_OUTCOMES,
  sessionHeadline,
  SessionOutcomeReceipt,
  sessionOutcomeLabel,
} from "../../src/features/study/services/sessionReflection";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

function receipt(
  operationId: string,
  outcome: StudyOutcome,
  questionId = `q-${operationId}`,
  topic = "Denklemler",
  subject = "Matematik",
): SessionOutcomeReceipt {
  return { operationId, questionId, subject, topic, outcome };
}

function build(receipts: SessionOutcomeReceipt[]) {
  return buildSessionReflection(receipts);
}

describe("session receipt — idempotency", () => {
  it("appends a confirmed outcome once", () => {
    const out = appendSessionReceipt([], receipt("op1", "solved"));
    expect(out).toHaveLength(1);
  });

  it("ignores a replayed success callback for the same operation", () => {
    let state = appendSessionReceipt([], receipt("op1", "solved"));
    state = appendSessionReceipt(state, receipt("op1", "solved"));
    state = appendSessionReceipt(state, receipt("op1", "solved"));
    expect(state).toHaveLength(1);
    expect(build(state).confirmedOutcomeCount).toBe(1);
  });

  it("counts a genuinely new operation on the same question", () => {
    // A student may legitimately answer the same question twice in a session;
    // that is two operations and therefore two outcomes.
    let state = appendSessionReceipt([], receipt("op1", "struggled", "q1"));
    state = appendSessionReceipt(state, receipt("op2", "solved", "q1"));
    const reflection = build(state);
    expect(reflection.confirmedOutcomeCount).toBe(2);
    expect(reflection.distinctQuestionCount).toBe(1);
  });

  it("never mutates the array it is given", () => {
    const original: SessionOutcomeReceipt[] = [receipt("op1", "solved")];
    appendSessionReceipt(original, receipt("op2", "solved"));
    expect(original).toHaveLength(1);
  });
});

describe("session reflection — counts", () => {
  it("is empty for a session with no confirmed outcomes", () => {
    const reflection = build([]);
    expect(reflection.isEmpty).toBe(true);
    expect(reflection.confirmedOutcomeCount).toBe(0);
    expect(reflection.moments).toHaveLength(0);
  });

  it("counts each canonical outcome separately", () => {
    const reflection = build([
      receipt("o1", "solved"),
      receipt("o2", "solved"),
      receipt("o3", "struggled"),
      receipt("o4", "again"),
    ]);
    expect(reflection.confirmedOutcomeCount).toBe(4);
    expect(reflection.solvedCount).toBe(2);
    expect(reflection.struggledCount).toBe(1);
    expect(reflection.againCount).toBe(1);
  });

  it("separates outcome count from distinct question count", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1"),
      receipt("o2", "solved", "q1"),
      receipt("o3", "solved", "q2"),
    ]);
    expect(reflection.confirmedOutcomeCount).toBe(3);
    expect(reflection.distinctQuestionCount).toBe(2);
  });
});

describe("session reflection — headline honesty", () => {
  it("says 'soru' only when outcomes and questions match", () => {
    const reflection = build([
      receipt("o1", "solved", "q1"),
      receipt("o2", "solved", "q2"),
    ]);
    expect(sessionHeadline(reflection)).toBe("2 soru üzerinde çalıştın");
  });

  it("does not call repeated attempts distinct questions", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1"),
      receipt("o2", "solved", "q1"),
      receipt("o3", "solved", "q2"),
    ]);
    const headline = sessionHeadline(reflection);
    expect(headline).toBe("3 çalışma sonucu kaydedildi");
    expect(headline).not.toContain("3 soru");
  });

  it("has an honest headline for an empty session", () => {
    expect(sessionHeadline(build([]))).toContain("kayıtlı sonuç yok");
  });
});

describe("session reflection — topic moments", () => {
  it("reads a real within-session recovery", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1"),
      receipt("o2", "solved", "q2"),
    ]);
    expect(reflection.moments[0]!.kind).toBe("recovery");
    expect(reflection.moments[0]!.observation).toBe(
      "Bu çalışmada zorlanmanın ardından çözüm görüldü.",
    );
  });

  it("reads repeated struggle", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1"),
      receipt("o2", "struggled", "q2"),
    ]);
    expect(reflection.moments[0]!.kind).toBe("repeated_struggle");
  });

  it("reads consecutive solves", () => {
    const reflection = build([receipt("o1", "solved", "q1"), receipt("o2", "solved", "q2")]);
    expect(reflection.moments[0]!.kind).toBe("steady");
  });

  it("reads a mixed run as mixed", () => {
    const reflection = build([
      receipt("o1", "solved", "q1"),
      receipt("o2", "struggled", "q2"),
      receipt("o3", "again", "q3"),
    ]);
    expect(reflection.moments[0]!.kind).toBe("mixed");
  });

  it("treats 'again' as neither struggle nor solve", () => {
    const reflection = build([receipt("o1", "again", "q1"), receipt("o2", "again", "q2")]);
    expect(reflection.moments[0]!.kind).not.toBe("repeated_struggle");
    expect(reflection.moments[0]!.kind).not.toBe("steady");
  });

  it("states no pattern from a single outcome", () => {
    const reflection = build([receipt("o1", "struggled", "q1")]);
    expect(reflection.confirmedOutcomeCount).toBe(1);
    expect(reflection.moments).toHaveLength(0);
  });

  it("preserves the order the student produced", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1"),
      receipt("o2", "again", "q2"),
      receipt("o3", "solved", "q3"),
    ]);
    expect(reflection.moments[0]!.outcomes).toEqual(["struggled", "again", "solved"]);
  });

  it("omits a topic story when metadata never resolved", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1", "", ""),
      receipt("o2", "solved", "q2", "", ""),
    ]);
    // The outcomes still count; only the topic story is withheld.
    expect(reflection.confirmedOutcomeCount).toBe(2);
    expect(reflection.moments).toHaveLength(0);
  });

  it("does not merge the same topic name under different subjects", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1", "Denklemler", "Matematik"),
      receipt("o2", "solved", "q2", "Denklemler", "Matematik"),
      receipt("o3", "solved", "q3", "Denklemler", "Fizik"),
    ]);
    expect(reflection.moments[0]!.subject).toBe("Matematik");
    expect(reflection.moments[0]!.outcomes).toHaveLength(2);
  });
});

describe("session reflection — moment selection", () => {
  it("leads with a recovery over a repeated struggle", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1", "Kuvvet", "Fizik"),
      receipt("o2", "struggled", "q2", "Kuvvet", "Fizik"),
      receipt("o3", "struggled", "q3", "Denklemler"),
      receipt("o4", "solved", "q4", "Denklemler"),
    ]);
    expect(reflection.moments[0]!.topic).toBe("Denklemler");
    expect(reflection.moments[0]!.kind).toBe("recovery");
  });

  it("caps how many moments a closure screen shows", () => {
    const many = ["A", "B", "C", "D"].flatMap((topic, i) => [
      receipt(`${topic}1`, "struggled", `q${i}a`, topic),
      receipt(`${topic}2`, "struggled", `q${i}b`, topic),
    ]);
    expect(build(many).moments.length).toBeLessThanOrEqual(MAX_SESSION_MOMENTS);
  });

  it("is deterministic regardless of grouping order", () => {
    const receipts = [
      receipt("o1", "solved", "q1", "Kuvvet", "Fizik"),
      receipt("o2", "solved", "q2", "Kuvvet", "Fizik"),
      receipt("o3", "struggled", "q3", "Denklemler"),
      receipt("o4", "solved", "q4", "Denklemler"),
    ];
    const forward = build(receipts).moments.map((m) => m.id);
    const reversed = build([...receipts].reverse()).moments.map((m) => m.id);
    // Same set of topics, chosen by the same rule.
    expect(new Set(reversed)).toEqual(new Set(forward));
    expect(build(receipts).moments.map((m) => m.id)).toEqual(forward);
  });

  it("requires the documented minimum before stating a pattern", () => {
    expect(MIN_MOMENT_OUTCOMES).toBe(2);
  });
});

describe("session reflection — copy safety", () => {
  const rich = [
    receipt("o1", "struggled", "q1"),
    receipt("o2", "solved", "q2"),
    receipt("o3", "solved", "q3", "Kuvvet", "Fizik"),
    receipt("o4", "again", "q4", "Kuvvet", "Fizik"),
  ];

  function allCopy() {
    const r = build(rich);
    return [sessionHeadline(r), ...r.moments.map((m) => m.observation)].join(" | ");
  }

  it("makes no causal claim about the session", () => {
    const copy = allCopy().toLocaleLowerCase("tr");
    for (const claim of ["geliştirdi", "sayesinde", "öğrendin", "artık biliyorsun", "başardın"]) {
      expect(copy).not.toContain(claim);
    }
  });

  it("states no score, percentage or lifetime total", () => {
    const copy = allCopy();
    expect(copy).not.toMatch(/%/);
    expect(copy).not.toMatch(/puan|skor|toplamda|doğruluk/i);
  });

  it("uses no unnecessary time-window language", () => {
    const copy = allCopy().toLocaleLowerCase("tr");
    for (const phrase of ["bu hafta", "geçen hafta", "son 7 gün", "bugün"]) {
      expect(copy).not.toContain(phrase);
    }
  });

  it("never leaks internal labels", () => {
    const copy = allCopy();
    for (const leak of [
      "operationId",
      "studyEvents",
      "sessionReceipt",
      "repeated_struggle",
      "persistent_struggle",
      "solved",
      "struggled",
    ]) {
      expect(copy).not.toContain(leak);
    }
  });

  it("labels outcomes in the student's own vocabulary", () => {
    expect(sessionOutcomeLabel("solved")).toBe("Çözdüm");
    expect(sessionOutcomeLabel("struggled")).toBe("Zorlandım");
    expect(sessionOutcomeLabel("again")).toBe("Tekrar Çalıştım");
  });

  it("does not blend lifetime evidence into a session claim", () => {
    // The legacy case: a student whose historical counters are unknown still
    // gets an honest account of the session they just did.
    const reflection = build([receipt("o1", "solved", "q1")]);
    const headline = sessionHeadline(reflection);
    expect(headline).toBe("1 soru üzerinde çalıştın");
    expect(headline).not.toContain("toplam");
  });
});

// §99 — the scenario the phase is meant to demonstrate.
describe("session reflection — the product case", () => {
  it("summarises a real mixed-topic session", () => {
    const reflection = build([
      receipt("o1", "struggled", "q1", "Denklemler"),
      receipt("o2", "solved", "q2", "Denklemler"),
      receipt("o3", "solved", "q3", "Geometri"),
    ]);
    expect(sessionHeadline(reflection)).toBe("3 soru üzerinde çalıştın");
    expect(reflection.solvedCount).toBe(2);
    expect(reflection.struggledCount).toBe(1);
    expect(reflection.moments[0]!.topic).toBe("Denklemler");
    expect(reflection.moments[0]!.observation).toContain("zorlanmanın ardından çözüm görüldü");
  });
});
