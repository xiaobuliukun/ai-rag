import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "墨序",
  slug: "moxu-app",
  version: "0.1.0",
  scheme: "moxu",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android"],
  ios: {
    bundleIdentifier: "app.moxu.mobile",
    supportsTablet: true
  },
  android: {
    package: "app.moxu.mobile"
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-splash-screen",
    "expo-status-bar"
  ],
  experiments: {
    typedRoutes: false
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    apiAccessToken: process.env.EXPO_PUBLIC_API_ACCESS_TOKEN
  }
};

export default config;
