import { visibilityLabel } from "@utils/questionLabels";

describe("visibilityLabel", () => {
  it("maps private to Sadece Ben", () => {
    expect(visibilityLabel("private")).toBe("Sadece Ben");
  });

  it("maps public to Herkese Açık", () => {
    expect(visibilityLabel("public")).toBe("Herkese Açık");
  });

  it("maps class to Sınıf", () => {
    expect(visibilityLabel("class")).toBe("Sınıf");
  });
});
