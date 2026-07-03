import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
  Image,
  Alert,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase"; // ✅ ADDED

export default function LoginScreen() {
  const router = useRouter();

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(255,255,255,0.4)",
        }}
      />

      <View style={styles.container}>
        <Text
          style={{
            fontFamily: "Euphoria",
            fontSize: 90,
            fontWeight: "bold",
            color: "#4d4139",
            marginBottom: 20,
          }}
        >
          Welcome
        </Text>

        {/* BACK BUTTON */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Image
            source={require("@/assets/images/arrow.png")}
            style={{ width: 80, height: 20 }}
          />
        </Pressable>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  backButton: {
    position: "absolute",
    top: 40,
    left: 10,
    zIndex: 20,
  },

  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },

  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: "white",
  },

  button: {
    padding: 12,
    backgroundColor: "black",
    marginTop: 10,
    width: "100%",
    alignItems: "center",
    borderRadius: 10,
  },

  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
});
