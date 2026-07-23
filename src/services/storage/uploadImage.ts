import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { storage } from "@services/firebase/config";

// expo-file-system v19 (SDK 54) moved the string-based cacheDirectory/
// writeAsStringAsync/EncodingType API used here to this legacy subpath —
// the new default export is a File/Directory class API instead.
//
// Loaded via require(), not a typed `import`, because this project's
// moduleSuffixes: [".native", ".web", ""] (needed for
// src/services/firebase/config.ts's initAuth.native/.web split) makes tsc
// statically resolve the package's bare `./ExponentFileSystem` import to
// its `.web.ts` variant (a narrow stub) instead of the real native module
// selector, which breaks typechecking deep inside the package's own
// source. This is a static-type-only artifact — Metro's real bundler
// resolution is unaffected and loads the correct native module either way.
// require() sidesteps it entirely: it never asks tsc to resolve the target
// module's internal types, only to trust this local annotation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem = require("expo-file-system/legacy") as {
  cacheDirectory: string | null;
  writeAsStringAsync: (
    fileUri: string,
    contents: string,
    options?: { encoding?: "utf8" | "base64" },
  ) => Promise<void>;
};

function isDataUri(uri: string): boolean {
  return uri.startsWith("data:");
}

// React Native's Blob implementation cannot construct a Blob from an
// ArrayBuffer/ArrayBufferView ("Creating blobs from 'ArrayBuffer' and
// 'ArrayBufferView' are not supported") — confirmed via a real on-device
// error. Firebase's uploadString(..., "data_url") hits exactly that path
// internally (it decodes the base64 payload to bytes, then wraps those
// bytes in `new Blob(...)`), so it cannot be used for data: URIs on RN.
// Instead: write the base64 payload out to a temporary local file, then
// upload it through the same fetch().blob() + uploadBytes path already
// used (and proven working on-device) for file:// URIs (camera/gallery
// picks) — fetch() on a real file produces a native Blob via RN's bridge,
// which is not subject to this limitation.
async function dataUriToTempFileUri(dataUri: string): Promise<string> {
  const commaIndex = dataUri.indexOf(",");
  const base64Payload = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : dataUri;
  const tempUri = `${FileSystem.cacheDirectory}drawing-upload-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(tempUri, base64Payload, { encoding: "base64" });
  return tempUri;
}

// Shared by questionImages/answerImages/avatar uploads. data: URIs
// (currently only DrawingBoard's SVG PNG export) are converted to a
// temporary file first — see dataUriToTempFileUri — then everything goes
// through the same fetch().blob() + uploadBytes path used for file:// URIs
// (camera/gallery picks).
export async function uploadImage(
  path: string,
  localUri: string,
  contentType: string,
): Promise<string> {
  const fileUri = isDataUri(localUri) ? await dataUriToTempFileUri(localUri) : localUri;

  const storageRef = ref(storage, path);
  const response = await fetch(fileUri);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType });

  return getDownloadURL(storageRef);
}
