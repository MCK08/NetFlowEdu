import { getAnswerMethodLabel } from "@features/answers/services/answerMethodLabel";

describe("getAnswerMethodLabel", () => {
  it("maps photo to Fotoğraf", () => {
    expect(getAnswerMethodLabel("photo")).toBe("Fotoğraf");
  });

  it("maps drawing to Çizim", () => {
    expect(getAnswerMethodLabel("drawing")).toBe("Çizim");
  });
});
