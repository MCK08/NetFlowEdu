// Phase 123 — the words used to hand out a class's join code, in one place.
//
// Pure (no react-native import) like every other service beside it, so the
// sentence a teacher sends and the label a screen reader speaks are both
// directly testable. The Share sheet itself is ShareCodeButton's job.
export function classShareMessage(name: string, code: string): string {
  return `${name} sınıfına katılmak için kod: ${code}`;
}

/** The spoken label for a share control, wherever it is drawn. */
export function shareClassCodeLabel(name: string): string {
  return `${name} sınıfının katılım kodunu paylaş`;
}
