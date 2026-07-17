module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  transform: {
    "^.+\\.tsx?$": "babel-jest",
  },
  testTimeout: 30000,
};
