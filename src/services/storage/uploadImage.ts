import { getDownloadURL, ref, uploadBytes, uploadString } from "firebase/storage";

import { storage } from "@services/firebase/config";

function isDataUri(uri: string): boolean {
  return uri.startsWith("data:");
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
