module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  transform: {
    "^.+\\.tsx?$": ["babel-jest", { configFile: "./babel.jest.config.js" }],
  },
  testTimeout: 30000,
};
