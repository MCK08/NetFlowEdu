const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Phase 105 — make the Release build reproducible from tracked source.
//
// THE DEFECT
// Xcode 27 refuses any target whose IPHONEOS_DEPLOYMENT_TARGET is below 15.0.
// A clean `expo prebuild` + `pod install` on this SDK produces 234 pod build
// configurations, of which SIX sit below that floor: SDWebImage 9.0,
// RNSVG-RNSVGFilters 12.4 and RNCAsyncStorage resources 13.4 (each in Debug
// and Release). The Release build fails outright on all three.
//
// WHY THE EXISTING CONFIGURATION DOES NOT COVER IT
// The generated Podfile already declares `platform :ios, '15.1'`, and React
// Native's own `react_native_post_install` raises deployment targets via
// ReactNativePodsUtils.updateOSDeploymentTarget. But that function iterates
// `pod_target_installation_results` and touches only each pod's MAIN
// `native_target` — it never visits `resource_bundle_targets`, which keep the
// value from their podspec. That is why exactly 228/234 come out correct and
// the six resource-bundle configurations do not. Verified directly: restoring
// the untouched generated Podfile and re-running `pod install` reproduces the
// same six low values every time, so this is upstream behaviour rather than
// stale local state.
//
// WHAT THIS DOES
// Appends one normalization loop to the generated Podfile's existing
// post_install hook, raising every Pods-project configuration to the Podfile's
// own platform floor. It only ever RAISES a value, never lowers one, so pods
// that already target 15.1+ are untouched. No product code, no JS, and no
// runtime behaviour is affected — this is build configuration only.
//
// Idempotent: keyed off MARKER so repeated prebuilds don't stack copies.

const MARKER = "netflowedu:resource-bundle-deployment-target";

const BLOCK = `
    # ${MARKER}
    # Raise any Pods configuration left below the Podfile's platform floor.
    # react_native_post_install normalizes pod main targets but not CocoaPods
    # RESOURCE BUNDLE targets, which Xcode 27 then rejects (< 15.0).
    floor = Gem::Version.new('15.1')
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        current = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current.to_s) < floor
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = floor.to_s
        end
      end
    end
`;

function addNormalization(contents) {
  if (contents.includes(MARKER)) return contents;

  const anchor = "  post_install do |installer|\n";
  const at = contents.indexOf(anchor);
  if (at === -1) {
    throw new Error(
      "withPodResourceBundleDeploymentTarget: no `post_install do |installer|` hook found in the " +
        "generated Podfile. The Expo template changed shape — update this plugin rather than " +
        "hand-editing ios/, which is gitignored and regenerated.",
    );
  }

  const insertAt = at + anchor.length;
  return contents.slice(0, insertAt) + BLOCK + contents.slice(insertAt);
}

module.exports = function withPodResourceBundleDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      const contents = fs.readFileSync(podfile, "utf8");
      fs.writeFileSync(podfile, addNormalization(contents));
      return cfg;
    },
  ]);
};

module.exports.addNormalization = addNormalization;
module.exports.MARKER = MARKER;
