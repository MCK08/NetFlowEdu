module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  transform: {
    "^.+\\.tsx?$": ["babel-jest", { configFile: "./babel.jest.config.js" }],
  },
  // functions/ has its own dependency tree (firebase-admin) — same reason
  // jest.config.js already adds this: the emulator concurrency test for
  // markAllNotificationsRead drives the REAL production function with the
  // real Admin SDK, which only resolves from functions/node_modules.
  moduleDirectories: ["node_modules", "functions/node_modules"],
  testTimeout: 30000,
};
