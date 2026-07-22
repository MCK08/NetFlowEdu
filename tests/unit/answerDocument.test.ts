import { buildAnswerDocument } from "@services/questions/answerDocument";

describe("buildAnswerDocument", () => {
  it("produces exactly the fields firestore.rules allows on create, with method 'drawing' preserved exactly", () => {
    const doc = buildAnswerDocument({
      questionId: "q1",
      ownerId: "user-1",
      imageUrl: "https://example.com/answer.png",
      method: "drawing",
    });

    expect(doc).toEqual({
      questionId: "q1",
      ownerId: "user-1",
      imageUrl: "https://example.com/answer.png",
      method: "drawing",
    });
  });

  it("preserves method 'photo' exactly", () => {
    const doc = buildAnswerDocument({
      questionId: "q1",
      ownerId: "user-1",
      imageUrl: "https://example.com/answer.jpg",
      method: "photo",
    });

    expect(doc.method).toBe("photo");
  });

  it("never includes fields firestore.rules doesn't recognize", () => {
    const doc = buildAnswerDocument({
      questionId: "q1",
      ownerId: "user-1",
      imageUrl: "https://example.com/answer.png",
      method: "drawing",
    });

    expect(Object.keys(doc).sort()).toEqual(["imageUrl", "method", "ownerId", "questionId"]);
  });
});
