import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "墨序",
  slug: "moxu-app",
  version: "0.1.0",
  scheme: "moxu",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "app.moxu.mobile",
    supportsTablet: true
  },
  android: {
    package: "app.moxu.mobile"
  },
  plugins: ["expo-router", "expo-secure-store", "expo-splash-screen"],
  experiments: {
    typedRoutes: false
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL
  }
};

export default config;
