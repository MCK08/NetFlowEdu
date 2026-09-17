/* eslint-disable @typescript-eslint/no-var-requires */
import { readFileSync } from "fs";
import { join } from "path";

// Phase 105 — the tracked fix that makes the iOS Release build reproducible.
//
// Xcode 27 rejects any target below iOS 15.0. React Native's own
// ReactNativePodsUtils.updateOSDeploymentTarget walks
// `pod_target_installation_results` and raises only each pod's MAIN
// native_target — it never visits resource_bundle_targets. A clean prebuild
// therefore produced 228/234 configurations at 15.1 and left SDWebImage
// (9.0), RNSVG-RNSVGFilters (12.4) and RNCAsyncStorage resources (13.4)
// below the floor, failing the Release build. Reproduced deliberately by
// restoring the untouched generated Podfile, so this is upstream behaviour
// and not stale local state.
//
// The plugin appends one normalization loop to the generated Podfile. These
// tests pin the two things that would silently break it: the anchor it
// splices into, and idempotency across repeated prebuilds.

const ROOT = join(__dirname, "..", "..");
const plugin = require(join(ROOT, "plugins", "withPodResourceBundleDeploymentTarget.js"));
const { addNormalization, MARKER } = plugin as {
  addNormalization: (contents: string) => string;
  MARKER: string;
};

const PODFILE_SHAPE = [
  "target 'NetFlowEdu' do",
  "  post_install do |installer|",
  "    react_native_post_install(",
  "      installer,",
  "    )",
  "  end",
  "end",
  "",
].join("\n");

describe("withPodResourceBundleDeploymentTarget", () => {
  it("splices the normalization into the generated post_install hook", () => {
    const out = addNormalization(PODFILE_SHAPE);

    expect(out).toContain(MARKER);
    expect(out).toContain("IPHONEOS_DEPLOYMENT_TARGET");
    // Inside post_install, not appended after the target block — a loop
    // outside the hook never runs.
    const hook = out.indexOf("post_install do |installer|");
    expect(out.indexOf(MARKER)).toBeGreaterThan(hook);
  });

  it("only ever RAISES a deployment target, never lowers one", () => {
    // The guard is a `<` comparison against the floor, so a pod already at
    // 15.1+ keeps its own value. Asserting the comparison exists is the
    // point: rewriting this to an unconditional assignment would silently
    // downgrade pods that legitimately require a newer minimum.
    const out = addNormalization(PODFILE_SHAPE);
    expect(out).toMatch(/Gem::Version\.new\(current\.to_s\) < floor/);
  });

  it("is idempotent across repeated prebuilds", () => {
    const once = addNormalization(PODFILE_SHAPE);
    const twice = addNormalization(once);

    expect(twice).toEqual(once);
    expect(twice.split(MARKER).length - 1).toBe(1);
  });

  it("fails loudly if the Expo Podfile template loses the hook", () => {
    // Silent no-op here would mean the next SDK bump quietly reintroduces a
    // Release build that cannot compile, discovered only at archive time.
    expect(() => addNormalization("target 'NetFlowEdu' do\nend\n")).toThrow(/post_install/);
  });

  it("is registered in the Expo config so prebuild actually applies it", () => {
    const app = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8"));
    expect(app.expo.plugins).toContain("./plugins/withPodResourceBundleDeploymentTarget");
  });
});
