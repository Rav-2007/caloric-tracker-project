import React from "react";
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
      <StatusBar style="dark" translucent />
      <Stack screenOptions={SCREEN_DEFAULT}>
        <Stack.Screen name="index" />
        {/* camera → review form their own mini-stack so back from review goes to camera */}
        <Stack.Screen name="camera" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="review" />
        <Stack.Screen name="progress" />
        <Stack.Screen name="diary" />
        <Stack.Screen name="profile" />
      </Stack>
    </SafeAreaProvider>
  );
}
