import { useEffect } from "react";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { supabase } from "@/lib/supabase";

export default function RootLayout() {
  const router = useRouter();

  const [loaded] = useFonts({
    Sirivennela: require("@/assets/fonts/Sirivennela-Regular.ttf"),
    Euphoria: require("@/assets/fonts/EuphoriaScript-Regular.ttf"),
  });

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          router.replace("/new_user");
        }
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!loaded) {
    return <View />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
