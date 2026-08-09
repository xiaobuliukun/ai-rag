module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@moxu/shared$": "<rootDir>/../shared/src"
  },
  watchman: false
};
