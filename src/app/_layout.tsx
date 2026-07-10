import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { View } from "react-native";

export default function RootLayout() {
  const [loaded] = useFonts({
    Sirivennela: require("@/assets/fonts/Sirivennela-Regular.ttf"),
    Euphoria: require("@/assets/fonts/EuphoriaScript-Regular.ttf"),
  });

  if (!loaded) {
    return <View />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
