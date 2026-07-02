import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren
} from "react";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { SettingsProvider } from "@/application/settings/settings-provider";
import {
  darkColors,
  lightColors,
  type AppColors
} from "@/design-system/tokens/colors";

type ThemeContextValue = {
  colors: AppColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function RootProviders({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  const value = useMemo(() => ({ colors, isDark }), [colors, isDark]);

  return (
    <ThemeContext.Provider value={value}>
      <SafeAreaProvider>
        <SettingsProvider>
          <StatusBar style={isDark ? "light" : "dark"} />
          {children}
        </SettingsProvider>
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used inside RootProviders");
  }

  return context;
}
