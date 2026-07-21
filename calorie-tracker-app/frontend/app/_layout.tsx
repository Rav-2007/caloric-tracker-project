import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

const SCREEN_DEFAULT: React.ComponentProps<typeof Stack.Screen>["options"] = {
  headerShown: false,
  contentStyle: { backgroundColor: "#F8FAFC" },
  animation: "slide_from_right",
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Dark icons over the light off-white backdrop.
          Camera screen overrides to "light" via its own <StatusBar />. */}
      <StatusBar style="dark" translucent />

      <Stack screenOptions={SCREEN_DEFAULT}>
        <Stack.Screen name="index" />
        <Stack.Screen name="camera" />
        <Stack.Screen name="review" />
        <Stack.Screen name="progress" />
        <Stack.Screen name="diary" />
        <Stack.Screen name="profile" />
      </Stack>
    </SafeAreaProvider>
  );
}
