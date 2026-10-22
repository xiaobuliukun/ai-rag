const path = require("node:path");

// jest-expo's native mocks import this Expo dependency directly. Resolve it
// relative to Expo so tests also work when npm installs it inside that package.
const expoModulesCore = path.dirname(require.resolve("expo-modules-core/package.json", {
  paths: [path.dirname(require.resolve("expo/package.json"))],
}));

module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  moduleNameMapper: {
    "^expo-modules-core(.*)$": `${expoModulesCore}$1`,
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@moxu/shared$": "<rootDir>/../shared/src"
  },
  watchman: false
};
