import { resolvePostInterventionAction } from "../../src/features/teacher/services/postInterventionAction";

describe("resolvePostInterventionAction", () => {
  // A/IMPROVED — no repeat-intervention action, unconditionally.
  it("A/IMPROVED — recommends monitor, never follow_up/escalate, even at high confidence", () => {
    const result = resolvePostInterventionAction("improved", "high");
    expect(result.kind).toBe("monitor");
  });

  it("A/IMPROVED — stays monitor even at low confidence (improved is unconditional)", () => {
    const result = resolvePostInterventionAction("improved", "low");
    expect(result.kind).toBe("monitor");
  });

  // B/NO_CHANGE + HIGH or MEDIUM confidence — meaningful follow-up available.
  it("B/NO_CHANGE + HIGH confidence — recommends follow_up", () => {
    expect(resolvePostInterventionAction("no_change", "high").kind).toBe("follow_up");
  });

  it("B/NO_CHANGE + MEDIUM confidence — recommends follow_up", () => {
    expect(resolvePostInterventionAction("no_change", "medium").kind).toBe("follow_up");
  });

  // C/NO_CHANGE + LOW confidence — no aggressive follow-up.
  it("C/NO_CHANGE + LOW confidence — recommends monitor, not follow_up", () => {
    expect(resolvePostInterventionAction("no_change", "low").kind).toBe("monitor");
  });

  // D/WORSENED + sufficient evidence — stronger action.
  it("D/WORSENED + HIGH confidence — recommends escalate", () => {
    expect(resolvePostInterventionAction("worsened", "high").kind).toBe("escalate");
  });

  it("D/WORSENED + MEDIUM confidence — recommends escalate", () => {
    expect(resolvePostInterventionAction("worsened", "medium").kind).toBe("escalate");
  });

  it("WORSENED + LOW confidence does NOT auto-escalate on weak evidence", () => {
    expect(resolvePostInterventionAction("worsened", "low").kind).toBe("monitor");
  });

  // E/INSUFFICIENT_DATA — always low confidence by construction; no
  // follow-up assignment recommendation.
  it("E/INSUFFICIENT_DATA — recommends monitor, never follow_up/escalate", () => {
    expect(resolvePostInterventionAction("insufficient_data", "low").kind).toBe("monitor");
  });

  // F/LEGACY — insufficient_data (the verdict every legacy/incomplete-
  // counter case resolves to upstream) gets the honest "not enough
  // evidence" reason, never the no_change or improved wording — no
  // fabricated conclusion borrowed from an unrelated branch.
  it("F/LEGACY — insufficient_data gets its own honest reason, not a borrowed one", () => {
    const result = resolvePostInterventionAction("insufficient_data", "low");
    expect(result.reason).toBe("Yeterli kanıt yok — şimdilik yeni bir aksiyon önerilmiyor.");
  });

  // I/DETERMINISM
  it("I/DETERMINISM — same input produces the same output across repeated calls", () => {
    const a = resolvePostInterventionAction("no_change", "medium");
    const b = resolvePostInterventionAction("no_change", "medium");
    expect(a).toEqual(b);
  });

  // L/CAUSAL LANGUAGE — reason text never claims the assignment/intervention
  // caused the outcome.
  it("L/CAUSAL LANGUAGE — no reason text claims the assignment succeeded or failed", () => {
    const kinds: [Parameters<typeof resolvePostInterventionAction>[0], Parameters<typeof resolvePostInterventionAction>[1]][] = [
      ["improved", "high"],
      ["no_change", "high"],
      ["no_change", "low"],
      ["worsened", "high"],
      ["worsened", "low"],
      ["insufficient_data", "low"],
    ];
    for (const [effectiveness, confidence] of kinds) {
      const { reason } = resolvePostInterventionAction(effectiveness, confidence);
      expect(reason).not.toMatch(/başarılı oldu|başarısız oldu|işe yaramadı|kötüleştirdi|artırdı/);
    }
  });
});
