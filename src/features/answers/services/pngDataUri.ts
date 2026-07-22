const PNG_DATA_URI_PREFIX = "data:image/png;base64,";

// react-native-svg's Svg.toDataURL callback returns raw base64 without a
// data: prefix — DrawingBoard needs a full data URI to hand to the Storage
// upload step (see src/services/storage/uploadImage.ts). This normalizes
// either shape (raw base64, or an already-prefixed data URI, in case a
// future react-native-svg version changes that) into one consistent
// data:image/png;base64,... string, and returns null for an empty/
// whitespace-only export so a blank canvas can never reach the upload step.
export function toPngDataUri(base64: string): string | null {
  const trimmed = base64.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("data:")) {
    const commaIndex = trimmed.indexOf(",");
    const payload = commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : "";
    return payload.trim().length === 0 ? null : trimmed;
  }

  return `${PNG_DATA_URI_PREFIX}${trimmed}`;
}
