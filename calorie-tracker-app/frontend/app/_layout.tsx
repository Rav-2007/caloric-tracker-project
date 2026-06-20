import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
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

      {/* Radial gradient bloom — top-left */}
      <View style={[styles.bloom, styles.bloomTopLeft]} pointerEvents="none" />
      {/* Radial gradient bloom — bottom-right */}
      <View style={[styles.bloom, styles.bloomBottomRight]} pointerEvents="none" />

      <Stack screenOptions={SCREEN_DEFAULT}>
        <Stack.Screen name="index" />
        <Stack.Screen name="camera" />
        <Stack.Screen name="review" />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bloom: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(85, 205, 252, 0.08)",
    zIndex: 0,
    pointerEvents: "none",
  },
  bloomTopLeft: {
    top: -120,
    left: -120,
  },
  bloomBottomRight: {
    bottom: -120,
    right: -120,
  },
});
