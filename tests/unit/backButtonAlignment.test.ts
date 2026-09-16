import fs from "fs";
import path from "path";

// Phase 103 — Phase 102 moved screens onto the shared AppBackButton, which
// renders IconButton, and IconButton centres its icon inside a 44pt hit area.
// Inside a ROW header that is invisible. Inside a COLUMN header — which
// stretches children to full width — the chevron lands in the middle of the
// row. The simulator showed exactly that on the class detail screens. This
// test keeps every AppBackButton that takes styles.backButton either in a row
// parent or explicitly aligned to the leading edge.

const root = path.join(__dirname, "..", "..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : e.name.endsWith(".tsx") ? [full] : [];
  });
}

function styleBlock(src: string, name: string): string | null {
  const m = new RegExp(`^\\s+${name}\\s*:\\s*\\{`, "m").exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  return src.slice(m.index, i);
}

const usages = walk(path.join(root, "src"))
  .map((file) => ({ file, src: fs.readFileSync(file, "utf8") }))
  .filter(({ src }) => /<AppBackButton[^>]*style=\{styles\.backButton\}/.test(src));

describe("AppBackButton sits at the leading edge", () => {
  it("finds the screens it is meant to guard", () => {
    expect(usages.length).toBeGreaterThanOrEqual(18);
  });

  it.each(usages.map((u) => [path.relative(root, u.file), u] as const))("%s", (_rel, { src }) => {
    const lines = src.split("\n");
    // The element can span several lines, so find the opening tag whose element
    // — up to its self-closing "/>" — carries style={styles.backButton}.
    const at = lines.findIndex((l, i) => {
      if (!l.includes("<AppBackButton")) return false;
      const end = lines.findIndex((m, k) => k >= i && m.includes("/>"));
      return lines.slice(i, end + 1).join("\n").includes("style={styles.backButton}");
    });
    expect(at).toBeGreaterThanOrEqual(0);
    const indent = lines[at]!.length - lines[at]!.trimStart().length;
    let parent: string | null = null;
    for (let j = at - 1; j >= 0; j--) {
      const line = lines[j]!;
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent < indent && /<(View|SafeAreaView|Animated\.View)\b/.test(line)) {
        parent = /style=\{\[?\s*styles\.(\w+)/.exec(line)?.[1] ?? null;
        break;
      }
    }
    const parentBlock = parent ? styleBlock(src, parent) : null;
    const isRow = !!parentBlock && /flexDirection:\s*"row"/.test(parentBlock);
    const aligned = /alignSelf:\s*"flex-start"/.test(styleBlock(src, "backButton") ?? "");
    expect(isRow || aligned).toBe(true);
  });
});
