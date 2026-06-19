import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Indian Calorie Tracker",
          headerStyle: { backgroundColor: Colors.slate50 },
          headerTintColor: Colors.slate900,
          headerTitleStyle: { fontWeight: "700", fontSize: 16 },
          headerShadowVisible: false,
        }}
      />
      {/* Camera runs full-screen — no chrome */}
      <Stack.Screen name="camera" options={{ headerShown: false }} />
    </Stack>
  );
}
