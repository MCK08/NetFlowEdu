import { httpsCallable } from "firebase/functions";

import { functions } from "./config";

// Records a teacher account request server-side; never grants the teacher
// role itself — see functions/src/teacherRequests/requestTeacherRole.ts.
export async function requestTeacherRole(
  displayName: string,
  organizationName: string,
): Promise<void> {
  const callable = httpsCallable(functions, "requestTeacherRole");
  await callable({ displayName, organizationName });
}

// Claims a unique username server-side — see functions/src/users/setUsername.ts.
export async function setUsername(username: string): Promise<void> {
  const callable = httpsCallable(functions, "setUsername");
  await callable({ username });
}

interface ToggleLikeResult {
  liked: boolean;
  likeCount: number;
}

// Toggles the caller's like on a question — the only way likeCount ever
// changes; see functions/src/social/toggleQuestionLike.ts.
export async function toggleQuestionLike(questionId: string): Promise<ToggleLikeResult> {
  const callable = httpsCallable<{ questionId: string }, ToggleLikeResult>(
    functions,
    "toggleQuestionLike",
  );
  const result = await callable({ questionId });
  return result.data;
}

// Same pattern for answers — see functions/src/social/toggleAnswerLike.ts.
export async function toggleAnswerLike(answerId: string): Promise<ToggleLikeResult> {
  const callable = httpsCallable<{ answerId: string }, ToggleLikeResult>(
    functions,
    "toggleAnswerLike",
  );
  const result = await callable({ answerId });
  return result.data;
}
