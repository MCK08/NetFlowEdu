import {
  buildAnswerImagePath,
  getAnswerContentType,
  getAnswerFileExtension,
} from "@services/storage/answerImagePath";

describe("getAnswerFileExtension", () => {
  it("uses png for drawing answers", () => {
    expect(getAnswerFileExtension("drawing")).toBe("png");
  });

  it("uses jpg for photo answers", () => {
    expect(getAnswerFileExtension("photo")).toBe("jpg");
  });
});

describe("getAnswerContentType", () => {
  it("is exactly image/png for drawing answers", () => {
    expect(getAnswerContentType("drawing")).toBe("image/png");
  });

  it("is exactly image/jpeg for photo answers", () => {
    expect(getAnswerContentType("photo")).toBe("image/jpeg");
  });
});

describe("buildAnswerImagePath", () => {
  it("matches storage.rules answers/{accessLevel}/{questionId}/{ownerId}/{fileName} for a public question", () => {
    const path = buildAnswerImagePath("q1", "user-1", "drawing", "public", 1700000000000);
    expect(path).toBe("answers/public/q1/user-1/1700000000000.png");
  });

  it("uses the private access level for a private question", () => {
    const path = buildAnswerImagePath("q1", "user-1", "drawing", "private", 123);
    expect(path).toBe("answers/private/q1/user-1/123.png");
  });

  it("collapses class visibility to the private access level (no real membership check yet)", () => {
    const path = buildAnswerImagePath("q1", "user-1", "drawing", "class", 123);
    expect(path).toBe("answers/private/q1/user-1/123.png");
  });

  it("produces a .png filename for drawing answers", () => {
    const path = buildAnswerImagePath("q1", "user-1", "drawing", "public", 123);
    expect(path.endsWith(".png")).toBe(true);
  });

  it("produces a .jpg filename for photo answers", () => {
    const path = buildAnswerImagePath("q1", "user-1", "photo", "public", 123);
    expect(path.endsWith(".jpg")).toBe(true);
  });

  it("places the file under the answer owner's own uid segment", () => {
    const path = buildAnswerImagePath("q1", "owner-uid", "drawing", "public", 123);
    expect(path).toContain("/owner-uid/");
  });
});
