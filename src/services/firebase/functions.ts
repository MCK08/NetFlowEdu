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

interface InitializeOnboardingResult {
  onboardingStatus: "pending" | "complete";
  requestedRole: "student" | "teacher" | null;
}

// Stage 1 — called right after registration, before email verification.
// Persists displayName + requestedRole only; grants no role/claims. See
// functions/src/onboarding/initializeOnboarding.ts.
export async function initializeOnboarding(
  requestedRole: "student" | "teacher",
  displayName: string,
): Promise<InitializeOnboardingResult> {
  const callable = httpsCallable<
    { requestedRole: "student" | "teacher"; displayName: string },
    InitializeOnboardingResult
  >(functions, "initializeOnboarding");
  const result = await callable({ requestedRole, displayName });
  return result.data;
}

interface CompleteOnboardingResult {
  role: "student" | "teacher";
  organizationId: string | null;
  onboardingStatus: "complete";
}

// Stage 2 — called once the caller's email is verified. Takes no role
// input: it only ever acts on the requestedRole Stage 1 already stored
// server-side. See functions/src/onboarding/completeOnboarding.ts.
export async function completeOnboarding(): Promise<CompleteOnboardingResult> {
  const callable = httpsCallable<Record<string, never>, CompleteOnboardingResult>(
    functions,
    "completeOnboarding",
  );
  const result = await callable({});
  return result.data;
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

interface CreateClassResult {
  classId: string;
  joinCode: string;
}

// See functions/src/classes/createClass.ts — the only path a class (and its
// unique join code) can ever be created through.
export async function createClass(name: string): Promise<CreateClassResult> {
  const callable = httpsCallable<{ name: string }, CreateClassResult>(functions, "createClass");
  const result = await callable({ name });
  return result.data;
}

interface JoinClassByCodeResult {
  classId: string;
  className: string;
  alreadyMember: boolean;
}

// See functions/src/classes/joinClassByCode.ts — the only path a student
// can ever become a class member.
export async function joinClassByCode(code: string): Promise<JoinClassByCodeResult> {
  const callable = httpsCallable<{ code: string }, JoinClassByCodeResult>(
    functions,
    "joinClassByCode",
  );
  const result = await callable({ code });
  return result.data;
}

// See functions/src/classes/leaveClass.ts.
export async function leaveClass(classId: string): Promise<{ left: boolean }> {
  const callable = httpsCallable<{ classId: string }, { left: boolean }>(functions, "leaveClass");
  const result = await callable({ classId });
  return result.data;
}

// See functions/src/classes/removeClassMember.ts — teacher-only.
export async function removeClassMember(
  classId: string,
  memberUid: string,
): Promise<{ removed: boolean }> {
  const callable = httpsCallable<{ classId: string; memberUid: string }, { removed: boolean }>(
    functions,
    "removeClassMember",
  );
  const result = await callable({ classId, memberUid });
  return result.data;
}

// See functions/src/classes/regenerateClassJoinCode.ts — teacher-only.
export async function regenerateClassJoinCode(classId: string): Promise<{ joinCode: string }> {
  const callable = httpsCallable<{ classId: string }, { joinCode: string }>(
    functions,
    "regenerateClassJoinCode",
  );
  const result = await callable({ classId });
  return result.data;
}
