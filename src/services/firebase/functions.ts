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
