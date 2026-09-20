import fs from "fs";
import path from "path";

// Phase 103 — Profile's friend/request counters must not infer "loading" from
// the summary's updatedAt. That timestamp is 0 both before the listener answers
// AND for every user with no friendship activity (no summary document exists),
// so inferring from it left every new account on permanent placeholders.

const root = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const code = (text: string) =>
  text.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

describe("profile social counters load state", () => {
  // Phase 114 — the counters are no longer a stat row above the fold; they
  // describe the Arkadaşlarım row that leads to them. The guarantee is
  // unchanged and still checked at the same place: Profile reads the
  // listener's own status and says nothing until it has answered.
  it("Profile reads the listener's own status, not a timestamp heuristic", () => {
    const screen = code(read("src/features/profile/screens/ProfileScreen.tsx"));
    expect(screen).toContain('socialMeta.status !== "ready"');
    expect(screen).not.toMatch(/updatedAt\s*===\s*0/);
  });

  it("the hook marks ready on any snapshot, including a missing document, and error on failure", () => {
    const hook = code(read("src/features/friends/hooks/useSocialMeta.ts"));
    expect(hook).toContain('(summary) => setState({ uid, summary, status: "ready" })');
    expect(hook).toContain('status: "error"');
    // A different account starts from loading, never from the previous one's counts.
    expect(hook).toContain("state.uid !== uid");
  });

  it("a listener failure is reported rather than disguised as an empty summary", () => {
    const service = code(read("src/services/firebase/friendships.ts"));
    expect(service).toMatch(/onError\s*\?\s*onError\(\)\s*:\s*onChange\(EMPTY_SOCIAL_META\)/);
  });
});
