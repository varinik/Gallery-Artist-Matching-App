import { useEffect } from "react";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";

export default function RootLayout() {
  const router = useRouter();

  const [loaded] = useFonts({
    Sirivennela: require("@/assets/fonts/Sirivennela-Regular.ttf"),
    Euphoria: require("@/assets/fonts/EuphoriaScript-Regular.ttf"),
  });

  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      console.log("hello");
      console.log(url);
      if (!url.includes("access_token")) return;

      const hashParams = new URLSearchParams(url.split("#")[1]);
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) console.error("setSession error:", error);
      }
      console.log(access_token);
      console.log(refresh_token);
      console.log(access_token && refresh_token);
    };

    // handle app opened from a killed state via the email link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
      console.log(url);
    });

    // handle app opened while already running
    const subscription = Linking.addEventListener("url", handleUrl);

    return () => subscription.remove();
  }, []);

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
