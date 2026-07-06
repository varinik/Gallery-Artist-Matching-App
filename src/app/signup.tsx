import {
  ImageBackground,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert("Missing fields");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      Alert.alert("Signup error", error.message);
      return;
    }

    Alert.alert(
      "Check your email",
      "We sent you a verification link. After verifying, you will continue setup.",
    );
  };

  // ✅ THIS handles navigation AFTER real authentication exists
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          router.replace("/new_user");
        }
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.container}>
        <Text style={styles.title}>Create Account</Text>

        <TextInput
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          style={styles.input}
        />

        <TextInput
          placeholder="Password"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />

        <Pressable style={styles.button} onPress={handleSignup}>
          <Text style={styles.buttonText}>Sign Up</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        {/* TEMP DEBUG BUTTON */}
        <Pressable
          onPress={() => router.replace("/new_user")}
          style={styles.backButton}
        >
          <Text style={styles.backText}>NEXT (DEV)</Text>
        </Pressable>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  title: {
    fontFamily: "Euphoria",
    fontSize: 45,
    fontWeight: "bold",
    color: "#4d4139",
    marginBottom: 30,
  },

  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 12,
    backgroundColor: "white",
  },

  button: {
    width: "100%",
    padding: 14,
    backgroundColor: "black",
    borderRadius: 12,
    marginTop: 10,
    alignItems: "center",
  },

  buttonText: {
    color: "white",
    fontWeight: "600",
  },

  backButton: {
    marginTop: 20,
  },

  backText: {
    color: "#4d4139",
    fontSize: 14,
  },
});
