module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/unit"],
  transform: {
    "^.+\\.tsx?$": ["babel-jest", { configFile: "./babel.jest.config.js" }],
  },
  testPathIgnorePatterns: ["/node_modules/"],
  // functions/ has its own separate dependency tree (firebase-admin,
  // firebase-functions) — Node's own require() resolves these fine for the
  // real Cloud Functions files via directory-walk-up, but Jest's resolver
  // (used by jest.mock's module lookup) only searches this list, so it
  // needs functions/node_modules added explicitly for
  // tests/unit/completeOnboarding.test.ts to be able to mock them.
  moduleDirectories: ["node_modules", "functions/node_modules"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@features/(.*)$": "<rootDir>/src/features/$1",
    "^@components/(.*)$": "<rootDir>/src/components/$1",
    "^@services/(.*)$": "<rootDir>/src/services/$1",
    "^@hooks/(.*)$": "<rootDir>/src/hooks/$1",
    "^@types/(.*)$": "<rootDir>/src/types/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@constants/(.*)$": "<rootDir>/src/constants/$1",
  },
};
