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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ✅ ADDED LOGIN FUNCTION
  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert("Login failed", error.message);
      return;
    }

    const user = data.user;

    if (!user) {
      Alert.alert("Error", "Unable to retrieve user.");
      return;
    }

    // Returning user
    router.replace("/artist_dashboard"); // Change to your actual homepage route
  };

  const [loading, setLoading] = useState(false);

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert("Enter your email first");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "myapp://reset-password", // change this for your app
    });

    setLoading(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Check your email", "We sent you a password reset link.");
  };

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

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          secureTextEntry
        />

        {/* ✅ CHANGED: now actually logs user in */}
        <Pressable
          onPress={handleLogin}
          style={[styles.button, { backgroundColor: "#977d6d" }]}
        >
          <Text style={[styles.buttonText, { color: "white" }]}>Login</Text>
        </Pressable>

        <Image
          source={require("@/assets/images/seperator.png")}
          style={{ width: 300, height: 25, marginVertical: 10 }}
        />

        <Pressable
          onPress={() => router.push("/signup")}
          style={[styles.button, { backgroundColor: "#977d6d" }]}
        >
          <Text style={[styles.buttonText, { color: "white" }]}>
            New User? Sign Up!
          </Text>
        </Pressable>

        {/* TEMPORARY BUTTON */}
        <Pressable
          onPress={() => router.push("/artist_dashboard")}
          style={[styles.button, { backgroundColor: "#977d6d" }]}
        >
          <Text style={[styles.buttonText, { color: "white" }]}>
            ARTIST DASHBOARD
          </Text>
        </Pressable>

        <Pressable
          onPress={handleResetPassword}
          style={{
            marginTop: 10,
            padding: 12,
            backgroundColor: "black",
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>
            {loading ? "Sending..." : "Forgot Password"}
          </Text>
        </Pressable>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
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
