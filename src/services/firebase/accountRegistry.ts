import AsyncStorage from "@react-native-async-storage/async-storage";

import { UserRole } from "@/types/user";

const STORAGE_KEY = "@netflowedu/known_accounts";

// Display metadata only — NEVER a password, token, or credential. The
// actual session for each of these accounts lives exclusively inside
// Firebase Auth's own persistence layer (a separate, uid-scoped Auth
// instance per account — see multiAccountAuth.ts), which already handles
// its own secure serialization; this registry only remembers enough to
// render the Account Switcher / Recent Accounts lists without asking
// Firestore again on every open.
export interface KnownAccount {
  uid: string;
  email: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  role: UserRole | null;
  lastUsedAt: number;
}

async function readAll(): Promise<KnownAccount[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as KnownAccount[]) : [];
  } catch {
    // Corrupted/foreign value under this key — treat as empty rather than
    // throwing, same "never let a bad cache crash the app" posture as
    // profileCacheService elsewhere in this codebase.
    return [];
  }
}

async function writeAll(accounts: KnownAccount[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

// Most-recently-used first — the single ordering both the Account Switcher
// bottom sheet and the Login screen's Recent Accounts list use. Pure, so
// it's directly unit-testable independent of AsyncStorage.
export function sortByRecentlyUsed(accounts: KnownAccount[]): KnownAccount[] {
  return [...accounts].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function listKnownAccounts(): Promise<KnownAccount[]> {
  return sortByRecentlyUsed(await readAll());
}

// Adds a new account or refreshes an existing one's display metadata,
// always bumping lastUsedAt to now (an upsert always means "this account
// was just used"). One entry per uid — never duplicated.
export async function upsertKnownAccount(
  account: Omit<KnownAccount, "lastUsedAt">,
): Promise<void> {
  const accounts = await readAll();
  const next = accounts.filter((a) => a.uid !== account.uid);
  next.push({ ...account, lastUsedAt: Date.now() });
  await writeAll(next);
}

// Bumps lastUsedAt only, without touching any other field — used when
// switching TO an already-known account, where the display metadata itself
// hasn't changed.
export async function touchKnownAccount(uid: string): Promise<void> {
  const accounts = await readAll();
  const index = accounts.findIndex((a) => a.uid === uid);
  if (index === -1) return;
  const existing = accounts[index];
  if (!existing) return;
  accounts[index] = { ...existing, lastUsedAt: Date.now() };
  await writeAll(accounts);
}

export async function removeKnownAccount(uid: string): Promise<void> {
  const accounts = await readAll();
  await writeAll(accounts.filter((a) => a.uid !== uid));
}
