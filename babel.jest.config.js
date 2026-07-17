// Separate from babel.config.js on purpose: the app's babel config includes
// the react-native-reanimated plugin, which errors when loaded outside a
// Metro/RN bundling context. Unit tests only import pure TS logic (no RN
// imports), so they don't need the RN preset or that plugin at all.
module.exports = {
  presets: [["@babel/preset-typescript"], ["@babel/preset-env", { targets: { node: "current" } }]],
};
