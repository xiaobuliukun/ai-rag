import type { ExpoConfig } from "expo/config";

const easProjectId = process.env.EAS_PROJECT_ID?.trim();

const config: ExpoConfig = {
  name: "墨序",
  slug: "moxu-app",
  version: "0.1.0",
  scheme: "moxu",
  icon: "./assets/icon.png",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android"],
  ios: {
    bundleIdentifier: "app.moxu.mobile",
    buildNumber: "1",
    supportsTablet: true
  },
  android: {
    package: "app.moxu.mobile",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f7f2ea"
    }
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 220,
        resizeMode: "contain",
        backgroundColor: "#f7f2ea",
        dark: {
          image: "./assets/splash-icon.png",
          backgroundColor: "#151310"
        }
      }
    ],
    "expo-status-bar"
  ],
  experiments: {
    typedRoutes: false
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    apiAccessToken: process.env.EXPO_PUBLIC_API_ACCESS_TOKEN,
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {})
  }
};

export default config;
