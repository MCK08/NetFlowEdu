// Excludes visually ambiguous characters (0/O, 1/I/L) — join codes are
// read aloud/copied by hand in a classroom, so ambiguity costs real support
// requests. 6 chars over this 31-symbol alphabet is ~5*10^8 combinations,
// comfortably collision-free at classroom scale even with the plain
// check-and-retry loop callers use (see createClass/regenerateClassJoinCode).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

// Uniqueness/lookup is case-insensitive and whitespace-tolerant — students
// retype codes by hand. The stored/displayed form is always uppercase.
export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase();
}
