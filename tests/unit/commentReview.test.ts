import fs from "fs";
import path from "path";

import { buildPublishedCommentDocument } from "../../functions/src/moderation/commentFinalization";
import { decideTextModeration } from "../../functions/src/moderation/moderationDecision";
import { normalizeForModeration } from "../../functions/src/moderation/textNormalization";
import { evaluateTextRules } from "../../functions/src/moderation/textRules";
import {
  COMMENT_REVIEW_QUEUE_EMPTY,
  commentReviewOutcomeCopy,
  commentReviewReasonCopy,
} from "../../src/features/teacher/services/answerReviewCopy";

// Phase 98 — the pure edges of class-scoped comment review.

const FUNCTIONS_SRC = path.join(__dirname, "..", "..", "functions", "src");
const read = (...p: string[]) => fs.readFileSync(path.join(FUNCTIONS_SRC, ...p), "utf8");
/** Comment lines stripped, so prose about a symbol is not read as use of it. */
const code = (text: string) =>
  text.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

describe("comment manual_review is reachable through the deterministic text layer", () => {
  // No text provider is configured (resolveProviders().text is null), so
  // the ONLY road to manual_review for a comment is the rules' own "review"
  // verdict. Each of these is a real, shipped category.
  it.each([
    ["ambiguous token", "sen tam bir hayvan gibisin"],
    ["wellbeing phrase", "artık yaşamak istemiyorum"],
    ["phone number", "beni ara 0532 123 45 67"],
    ["social handle", "instagram: @ogrenci_hesabi yaz"],
    ["repetitive spam", "abc abc abc abc abc abc abc abc abc abc"],
  ])("%s → review → manual_review / uncertain", (_label, text) => {
    const rules = evaluateTextRules(normalizeForModeration(text));
    expect(rules.verdict).toBe("review");
    const decision = decideTextModeration({ rules, provider: null });
    expect(decision.state).toBe("manual_review");
    expect(decision.reason).toBe("uncertain");
  });

  it("a clean comment still auto-approves and an explicit block still rejects", () => {
    const clean = decideTextModeration({
      rules: evaluateTextRules(normalizeForModeration("Güzel bir çözüm, teşekkürler.")),
      provider: null,
    });
    expect(clean.state).toBe("approved");
    const blocked = decideTextModeration({
      rules: evaluateTextRules(normalizeForModeration("seni geberteceğim")),
      provider: null,
    });
    expect(blocked.state).toBe("rejected");
  });
});

describe("the published comment document is one shape", () => {
  it("carries exactly the fields the client and the Phase 93 gateway read", () => {
    const doc = buildPublishedCommentDocument({ questionId: "q1", ownerId: "s1", text: "merhaba", now: 5 });
    expect(Object.keys(doc).sort()).toEqual(["createdAt", "ownerId", "questionId", "status", "text"]);
    expect(doc.status).toBe("active");
    expect(doc.createdAt).toEqual(new Date(5));
    expect(doc).not.toHaveProperty("reviewedBy");
  });

  it("is used by BOTH the automated gate and the manual review path, and nowhere else spells the shape", () => {
    const submit = code(read("moderation", "submitQuestionComment.ts"));
    const manual = code(read("review", "commentReview.ts"));
    expect(submit).toContain("finalizeApprovedComment(");
    expect(manual).toContain("finalizeApprovedComment(");
    expect(submit).not.toContain('status: "active"');
    expect(manual).not.toContain('status: "active"');
  });
});

describe("the comment review path keeps the Phase 97 boundary", () => {
  const manual = code(read("review", "commentReview.ts"));
  const shared = code(read("review", "reviewAuthorization.ts"));

  it("reviews only question_comment submissions, through the shared class-teacher check", () => {
    expect(manual).toContain('"question_comment"');
    expect(manual).toContain("assertMayReview(");
    expect(shared).toContain("teacherId !== callerUid");
    expect(shared).toContain("authorId === callerUid");
    expect(code(manual + shared)).not.toMatch(/organization_admin|platform_admin|isOrgAdmin|isPlatformAdmin/);
  });

  it("publishes the retained text only — no replacement text can arrive in the request", () => {
    // The decision handler: a submission id and a word, nothing else.
    const decision = manual.slice(manual.indexOf("export async function applyCommentReview"));
    expect(decision).toContain("const text = current.text;");
    for (const forbidden of ["data?.text", "data?.authorId", "data?.classId", "data?.questionId", "data?.status", "data?.reviewerId", "data?.createdAt"]) {
      expect(decision).not.toContain(forbidden);
    }
    // The queue takes a classId to LIST, and the server verifies the caller
    // is that class's teacher — it is scope, never authority.
    expect(manual).toContain("assertClassTeacher(db, null, classId, uid)");
  });

  it("never touches counters, notifications, deletes or learning evidence", () => {
    expect(manual).not.toMatch(/commentCount|FieldValue\.increment|prepareNotification|commitNotification/);
    expect(manual).not.toMatch(/\.delete\(/);
    expect(manual).not.toMatch(/studyEvents|studyItems|semanticDefinitions/);
    expect(manual).not.toMatch(/"removed"/);
  });

  it("does not re-apply the author submission throttle to a reviewer's approval", () => {
    expect(manual).not.toMatch(/moderationMeta|lastSubmissionAt|resource-exhausted/);
  });

  it("is exported, and shares one index with the answer queue", () => {
    const index = read("index.ts");
    for (const name of ["listCommentReviewQueue", "getCommentReviewDetail", "reviewCommentSubmission"]) {
      expect(index).toContain(name);
    }
    const indexes = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "firestore.indexes.json"), "utf8"),
    ) as { indexes: { collectionGroup: string; fields: { fieldPath: string }[] }[] };
    const moderation = indexes.indexes.filter((i) => i.collectionGroup === "moderationSubmissions");
    // Exactly one composite index; targetType is an equality filter in it.
    expect(moderation).toHaveLength(1);
    expect(moderation[0]?.fields.map((f) => f.fieldPath)).toEqual(["classId", "targetType", "status", "createdAt"]);
  });
});

describe("teacher-facing comment copy", () => {
  it("describes the automated check, never the student", () => {
    for (const reason of ["uncertain", "provider_unavailable", "other"]) {
      const copy = commentReviewReasonCopy(reason);
      expect(copy).toMatch(/Otomatik inceleme/);
      expect(copy).not.toMatch(/güvensiz|şüpheli|tehlikeli|riskli|öğrenci/i);
    }
    expect(commentReviewReasonCopy("uncertain")).toBe("Otomatik inceleme bu yorum için kesin karar veremedi.");
  });

  it("uses publication vocabulary and claims only what is known", () => {
    for (const text of [commentReviewOutcomeCopy("approved", false), commentReviewOutcomeCopy("rejected", false)]) {
      expect(text).not.toMatch(/doğru|yanlış|başarılı|başarısız/i);
    }
    expect(commentReviewOutcomeCopy("approved", false)).toBe("Yorum yayınlandı.");
    expect(commentReviewOutcomeCopy("rejected", false)).toBe("Yorum yayınlanmadı.");
    expect(commentReviewOutcomeCopy("approved", true)).toBe("Bu yorum zaten yayınlanmış.");
    expect(COMMENT_REVIEW_QUEUE_EMPTY.title).toBe("İncelenecek yorum yok.");
  });
});
