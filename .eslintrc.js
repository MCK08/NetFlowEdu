module.exports = {
  root: true,
  extends: ["expo", "prettier"],
  ignorePatterns: ["/dist/*", "functions/*"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
};
