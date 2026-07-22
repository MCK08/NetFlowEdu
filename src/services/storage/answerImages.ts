import { uploadImage } from "./uploadImage";
import { AnswerMethod, buildAnswerImagePath, getAnswerContentType } from "./answerImagePath";

export type { AnswerMethod } from "./answerImagePath";
export { buildAnswerImagePath, getAnswerContentType, getAnswerFileExtension } from "./answerImagePath";

export async function uploadAnswerImage(
  questionId: string,
  uid: string,
  localUri: string,
  method: AnswerMethod,
): Promise<string> {
  return uploadImage(
    buildAnswerImagePath(questionId, uid, method),
    localUri,
    getAnswerContentType(method),
  );
}
