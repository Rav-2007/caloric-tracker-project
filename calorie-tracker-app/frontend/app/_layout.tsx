import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";

const SCREEN_DEFAULT: React.ComponentProps<typeof Stack.Screen>["options"] = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.backdrop },
  animation: "slide_from_right",
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/*
        Dark icons over the light off-white backdrop.
        Camera screen overrides to "light" via its own <StatusBar style="light" />.
      */}
      <StatusBar style="dark" translucent />

      <Stack screenOptions={SCREEN_DEFAULT}>
        <Stack.Screen name="index" />
        <Stack.Screen name="camera" />
        <Stack.Screen name="review" />
      </Stack>
    </SafeAreaProvider>
  );
}
