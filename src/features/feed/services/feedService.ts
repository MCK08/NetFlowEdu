import { getOwnQuestions } from "@services/questions/questions";

import { Question } from "../types";

export async function loadFeed(uid: string): Promise<Question[]> {
  return getOwnQuestions(uid);
}
