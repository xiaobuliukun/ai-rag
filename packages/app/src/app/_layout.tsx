import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { RootProviders } from "@/application/providers/root-providers";

export default function RootLayout() {
  return (
    <RootProviders>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="book/[bookId]" />
        <Stack.Screen name="chapter/[bookId]/[chapterId]" />
      </Stack>
    </RootProviders>
  );
}
