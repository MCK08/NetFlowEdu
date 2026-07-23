import { getDownloadURL, ref, uploadBytes, uploadString } from "firebase/storage";

import { app, auth, storage } from "@services/firebase/config";

function isDataUri(uri: string): boolean {
  return uri.startsWith("data:");
}

// TEMPORARY diagnostic instrumentation — proves (or disproves) whether
// Auth and Storage share one Firebase App instance and whether an ID token
// is actually attached at upload time. Read-only: never touches upload
// logic, rules, or business logic. Never logs the token itself — only
// whether one was obtained and its length.
async function logAuthStorageIdentity(): Promise<void> {
  if (!__DEV__) return;
  console.log("[ANSWER_UPLOAD] app.name", app.name);
  console.log("[ANSWER_UPLOAD] app.options.projectId", app.options.projectId);
  console.log("[ANSWER_UPLOAD] app.options.storageBucket", app.options.storageBucket);
  console.log("[ANSWER_UPLOAD] storage.app.name", storage.app.name);
  console.log("[ANSWER_UPLOAD] storage.app.options.projectId", storage.app.options.projectId);
  console.log(
    "[ANSWER_UPLOAD] storage.app.options.storageBucket",
    storage.app.options.storageBucket,
  );
  console.log("[ANSWER_UPLOAD] storage.app === app", storage.app === app);
  console.log("[ANSWER_UPLOAD] auth.app === app", auth.app === app);
  console.log("[ANSWER_UPLOAD] auth.currentUser?.uid", auth.currentUser?.uid ?? null);
  try {
    const token = await auth.currentUser?.getIdToken();
    console.log("[ANSWER_UPLOAD] getIdToken() succeeded", Boolean(token));
    console.log("[ANSWER_UPLOAD] getIdToken() length", token?.length ?? 0);
  } catch (error) {
    const err = error as { code?: unknown; message?: unknown };
    console.log("[ANSWER_UPLOAD] getIdToken() FAILED", err?.code, err?.message);
  }
}

// Shared by questionImages/answerImages/avatar uploads. Two upload paths:
//
// - file:// URIs (camera/gallery picks) go through fetch().blob() +
//   uploadBytes — this works fine on-device, RN's fetch reads local files
//   through its native networking layer without issue.
// - data: URIs (currently only DrawingBoard's SVG PNG export) go through
//   uploadString(..., "data_url") instead. React Native's fetch does not
//   reliably support the data: scheme on real devices — fetch(dataUri)
//   fails on-device even where it can appear to work in some dev/simulator
//   conditions, which is why this specific bug only showed up in
//   production builds. uploadString parses the data URI directly and never
//   touches fetch/Blob, sidestepping the problem entirely.
export async function uploadImage(
  path: string,
  localUri: string,
  contentType: string,
): Promise<string> {
  await logAuthStorageIdentity();

  const storageRef = ref(storage, path);

  if (isDataUri(localUri)) {
    // TEMPORARY diagnostic instrumentation — remove once the production-
    // device drawing-save bug is confirmed fixed. Only fires for data: URI
    // uploads, i.e. currently only DrawingBoard's PNG export.
    if (__DEV__) {
      console.log("[DRAWING] generated storage path", path);
      console.log("[DRAWING] content type", contentType);
      console.log("[DRAWING] uploadString started");
    }
    await uploadString(storageRef, localUri, "data_url", { contentType });
    if (__DEV__) console.log("[DRAWING] uploadString completed");
  } else {
    const response = await fetch(localUri);
    const blob = await response.blob();
    await uploadBytes(storageRef, blob, { contentType });
  }

  return getDownloadURL(storageRef);
}
